
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
    console.error("  -host     Consul host");
    console.error("  -port     Consul port, default 8500");
    console.error("  -tag      tag of the docker containers to include");
    console.error(ctx.helpText);
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


// start the update process (optional)
// can be used to implement a watch on consul
function start(ctx, update) {
  // for now we use an update interval
  setInterval(update, (ctx.config.refreshInterval||5)*1000);
  update();
}

module.exports={
  init: init,
  fetchData: fetchData,
  start: start,
};
