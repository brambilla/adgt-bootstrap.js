var WebSocketServer = require('websocket').server;
var https = require('https');
var fs = require('fs');

var options = {
  key: fs.readFileSync('privkey.pem'),
  cert: fs.readFileSync('fullchain.pem'),
  ca: fs.readFileSync('chain.pem')
};

var PeerSet = function () {
    this.peers = [];
};

PeerSet.prototype.add = function(descriptor, connection) {
    if(this.peers[descriptor.key]) {
        this.peers[descriptor.key].descriptor = descriptor;
        return false;
    } else {
        this.peers[descriptor.key] = {descriptor: descriptor, connection: connection};
        return true;
    }
};

PeerSet.prototype.removeFromConnection = function(connection) {
    var keyToRemove = null;
    for(var key in this.peers) {
        if(this.peers[key].connection === connection) {
            keyToRemove = key;
            break;
        }
    }
    if(keyToRemove) {
        delete this.peers[key];
    }
};

PeerSet.prototype.removeFromDescriptor = function(descriptor) {
    delete this.peers[descriptor.key];
};

PeerSet.prototype.retrieveConnection = function(descriptor) {
    var peer = this.peers[descriptor.key];
    if(peer) {
        return peer.connection;
    } else {
        return null;
    }
};

PeerSet.prototype.retrieveDescriptor = function(connection) {
    for(var key in this.peers) {
        if(this.peers[key].connection === connection) {
            return this.peers[key].descriptor;
        }
    }
    return null;
};

PeerSet.prototype.retrieveNRandomDescriptors = function(n, keyToExclude) {
    if(Object.keys(this.peers).length > 1) {
        var indexes = [];
        var index = 0;
        for(var key in this.peers) {
            if(key != keyToExclude) {
                indexes.push(index);
            }
            index = index + 1;
        }

        //shuffle!
        var j, x, i;
        for (i = indexes.length; i; i--) {
            j = Math.floor(Math.random() * i);
            x = indexes[i - 1];
            indexes[i - 1] = indexes[j];
            indexes[j] = x;
        }

        indexes = indexes.slice(0, Math.min(Object.keys(this.peers).length - 1, n));

        index = 0;
        var descriptors = [];
        for(var key in this.peers) {
            if(indexes.indexOf(index) != -1) {
                descriptors.push(this.peers[key].descriptor);
            }
            index = index + 1;
        }
        return descriptors;
    } else {
        return [];
    }
};

var server = https.createServer(options, function(request, response) {
    response.writeHead(200);
    response.end('Hello World!');
    response.end();
});
server.listen(3002, function() {
    //console.log((new Date()) + ' Server is listening on port 3002');
});

var peerSet = new PeerSet();

var wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      return;
    }

    var connection = request.accept('bootstrapping', request.origin);
    
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            var UTF8Message = JSON.parse(message.utf8Data);
            switch(UTF8Message.type) {
                case "DISCOVERY_REQUEST":
                    handleDiscoveryRequestMessage(UTF8Message, connection);
                    break;
                case "SIGNALING":
                    handleSignalingMessage(UTF8Message, connection);
                    break;
                case "TRACKING":
                    handleTrackingMessage(UTF8Message, connection);
                    break;
                default:
                    break;
            }
        } else if (message.type === 'binary') {
            handleBinaryMessage(message.binaryData, connection);
        }
    });

    connection.on('close', function(reasonCode, description) {
        var descriptor = peerSet.retrieveDescriptor(connection);
        console.log(new Date() + ',' + descriptor.key + ',D');
        peerSet.removeFromConnection(connection);
    });
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

function handleDiscoveryRequestMessage(message, connection) {
    if(peerSet.add(message.sender, connection)) {
        console.log(new Date() + ',' + message.sender.key + ',C,'+ message.sender.position.coords.latitude + ',' + message.sender.position.coords.longitude);
    }

    var descriptors = peerSet.retrieveNRandomDescriptors(5, message.sender.key);
    if(descriptors.length > 0) {
        var message = {
            sender: null,
            descriptors: descriptors,
            type: 'DISCOVERY_RESPONSE'
        };
        connection.send(JSON.stringify(message));
    }
}

function handleSignalingMessage(message, connection) {
    var connection = peerSet.retrieveConnection(message.recipient);
    if(connection) {
        connection.send(JSON.stringify(message.payload));
    }
}

function handleTrackingMessage(message, connection) {
    console.log(new Date() + ',' + message.sender.key + ',' + message.payload.type + ',' + message.sender.position.coords.latitude + ',' + message.sender.position.coords.longitude + ',' + message.payload.body);
}

function handleBinaryMessage(message, connection) {
    connection.sendBytes(message);
}
