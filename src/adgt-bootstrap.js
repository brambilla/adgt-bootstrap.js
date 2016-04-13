var WebSocketServer = require('websocket').server;
var https = require('https');
var fs = require('fs');

var options = {
  key: fs.readFileSync('macbeth.ce.unipr.it.key.pem'),
  cert: fs.readFileSync('macbeth.ce.unipr.it.cert.pem')
};

var PeerSet = function () {
    this.peers = [];
};

PeerSet.prototype.add = function(descriptor, connection) {
    this.peers[descriptor.key] = {descriptor: descriptor, connection: connection};
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

PeerSet.prototype.retrieveRandomDescriptor = function() {
    var randomIndex = Math.floor(Math.random()*(Object.keys(this.peers).length));
    var index = 0;
    for(var key in this.peers) {
        if(index === randomIndex) {
            return this.peers[key].descriptor;
        }
        index = index + 1;
    }
    return null;
};

var server = https.createServer(options, function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(3000, function() {
    console.log((new Date()) + ' Server is listening on port 3000');
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
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }

    var connection = request.accept('bootstrapping', request.origin);
    
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            var UTF8Message = JSON.parse(message.utf8Data);
            console.log('Ricevuto ' + UTF8Message.type + ' da ' + UTF8Message.sender.key);
            switch(UTF8Message.type) {
                case "DISCOVERY_REQUEST":
                    handleDiscoveryRequestMessage(UTF8Message, connection);
                    break;
                case "SIGNALING":
                    handleSignalingMessage(UTF8Message, connection);
                    break;
                default:
                    break;
            }
        } else if (message.type === 'binary') {
            handleBinaryMessage(message.binaryData, connection);
        }
    });

    connection.on('close', function(reasonCode, description) {
        peerSet.removeFromConnection(connection);
    });
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

function handleDiscoveryRequestMessage(message, connection) {
    peerSet.add(message.sender, connection);
    var descriptors = [];
    var randomDescriptor = peerSet.retrieveRandomDescriptor();
    if(randomDescriptor.key !== message.sender.key) {
      descriptors.push(randomDescriptor);
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
        console.log('Ho inviato un ' + message.payload.type + ' a ' + JSON.stringify(message.recipient.key) + ' da parte di ' + JSON.stringify(message.sender.key));
    }
}

function handleBinaryMessage(message, connection) {
    console.log('Received Binary Message of ' + message.length + ' bytes');
    connection.sendBytes(message);
}
