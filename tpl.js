
var Promise=require("bluebird");
var Consul=require("consul");
var _=require("lodash");

var consul;
var tagName;

// init runs at startup to configure options and connect to consul

function init(ctx, showHelp) {
  var args=ctx.args;

  if (showHelp || ctx.argv.length>0 || !args.host || !args.tag) {
    console.error("usage: -host=HOSTNAME [-port=PORT] -tag=TAGNAME");
    console.error();
    console.error("  -host:   Consul host");
    console.error("  -port:   Consul port, default 8500");
    console.error("  -tag:    tag of the docker containers to include");
    console.error();
    console.error("  {-?|-help} show help.");
    return false;
  }

  consul=Consul({ host: args.host, port: args.port||8500 });
  consul.catalog.service=Promise.promisifyAll(consul.catalog.service);
  tagName=args.tag;
  return true;
}


// fetchData will query consul and return a data structure
// that can be used to generate the template

function fetchData(ctx) {

  return consul.catalog.service.listAsync().then(services => {
    // map services to array, then filter by tag
    return Object.keys(services)
      .map(x => ({ name: x, tags: services[x] }))
      .filter(x => x.tags.find(tag => tag===tagName));
  })
  .map(x => {
    // add nodes
    return consul.catalog.service.nodesAsync(x.name).then(nodes => {
      // convert keys to camelCase
      x.nodes=nodes.map(node => _.mapKeys(node, (v,k) => _.camelCase(k)));
      return x;
    });
  }).then(x => ({ services: x }));
}


// define the template to generate the haproxy.cfg

/*
services was generated by the code above and contains data in
the following format:
[ {
  name: 'MyService',
  tags: [ 'rest' ],
  nodes: [ {
    node: 'hostname',
    address: '10.1.1.2',
    serviceID: 'hostname:gitlab:80',
    serviceName: 'gitlab-ce-80',
    serviceTags: [],
    serviceAddress: '10.1.1.2',
    servicePort: 80,
    }, ... ]
  }, ... ]
*/

var tpl=
`global
  daemon
  chroot      /var/lib/haproxy
  pidfile     /var/run/haproxy.pid
  maxconn     4000
  user        haproxy
  group       haproxy
  log 127.0.0.1   local0
  log 127.0.0.1   local1 notice
  log 127.0.0.1   local2

defaults
  mode http
  log global
  option httplog
  option dontlognull
  retries 3
  timeout http-request    10s
  timeout queue           1m
  timeout connect         10s
  timeout client          1m
  timeout server          1m
  timeout http-keep-alive 10s
  timeout check           10s
  maxconn                 3000

frontend http-in
  bind *:80
<% services.forEach(svc => {
%>  acl app_<%=svc.name%> path_beg -i /<%=svc.name%>/
  use_backend svr_<%=svc.name%> if app_<%=svc.name%>
<% }); %>

<% services.forEach(svc => {
%>backend svr_<%=svc.name%>
  mode http
  balance roundrobin
  option forwardfor
  option httpchk HEAD /health HTTP/1.1\\r\\nHost:localhost
  reqrep ^([^\\ ]*\\ /)<%=svc.name%>[/]?(.*)   \\1\\2
<%   svc.nodes.forEach(node => {
%>  server <%=node.node%>_<%=node.servicePort%> <%=node.serviceAddress%>:<%=node.servicePort%> check
<%   }); %>
<% });
%>
listen stats
  bind *:1936
  mode http
  stats enable
  stats uri /
  stats hide-version
  stats auth stat:view
`;

module.exports={
  init: init,
  fetchData: fetchData,
  template: tpl,
};
