FROM alpine
MAINTAINER Christian Zangl, http://github.com/laktak/

EXPOSE 80 1936

# install node & haproxy
RUN apk --update add nodejs=4.2.4-r1 haproxy=1.6.2-r0

COPY config.hjson controller.js package.json /app/

# install dyconf & dependencies
RUN npm i dyconf@1.0.0 -g && cd /app && npm i

ENTRYPOINT ["/usr/bin/dyconf", "-config=/app/config.hjson"]
