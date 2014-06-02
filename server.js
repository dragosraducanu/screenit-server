var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var path = require('path');
var formidable = require('formidable');
var util = require('util');

var session = new Array();
var sockets = new Array();
app.listen(80);

var myFiles = new Array();

var UNDEFINED = 'undefined'; 
var ClientType = {
	ANDROID : 'android',
	BROWSER : 'browser'
};

var Event = {
	CONNECTION : 'connection',
	DISCONNECT : 'disconnect',
	REQUEST_CLIENT_TYPE : 'requestClientType',
	REQUEST_ID : 'requestID',
	ID_GENERATED : 'idGeneratedEvent',
	PAIR_CLIENTS : 'pairClients',
	BROWSER_WINDOW_SIZE : 'browserWindowSize',
	PUSH_IMAGE_TO_BROWSER : 'pushImageToBrowser',
	CHANGE_SLIDE_IN_BROWSER : 'changeSlideInBrowser',
	CLIENT_TYPE : 'clientType',
	IMAGE_PUSH : 'imagePush',
	GO_TO_SLIDE : 'goToSlideNum',
	BAD_BROWSER_ID : 'badBrowserId',
	SEND_BROWSER_SIZE : 'sendBrowserSize',
	DEVICE_DISCONNECTED : 'deviceDisconnected'
}

function handleEmailRequest(request, response){
	var form = new formidable.IncomingForm();
	form.parse(request, function(err, fields) {
		if(err) throw err;
		console.log('new email: '+ fields.email);

		var stream = fs.createWriteStream("emails.txt", {'flags': 'a'});
		stream.once('open', function(fd) {
				stream.write(fields.email+" "+Date.now()
					+"\r\n");
				stream.end();
			});
		response.end();
	});
}

function handleUpload(request, response) {
	var form = new formidable.IncomingForm();
	
	form.uploadDir = './uploads/';

	form.parse(request, function(err, fields, files) {
		if (err) throw err;
		response.writeHead(200, {'content-type': 'text/plain'});
		response.write('received upload:\n\n');
		var bID;
		var socketBrowser;
		var imgPath = files['source'].path;

		console.log(imgPath);
		if(!isUndefined(fields.androidID)){
			bID = session[fields.androidID];
			socketBrowser = sockets[bID];

			if(isUndefined(myFiles[fields.androidID])) {
				myFiles[fields.androidID] = new Array();
			}

			myFiles[fields.androidID].push(imgPath);
			console.log("Android with ID: " + fields.androidID +" started uploading");

		}
		io.sockets.socket(socketBrowser).emit('imagePush', {img :imgPath });
		response.end(util.inspect({fields: fields, files: files}));
	});

}


function isUndefined(obj) {
	return (typeof obj == UNDEFINED);
}

function handleServePage(request, response, filePath) {
	var extname = path.extname(filePath);
	var contentType = 'text/html';
	switch (extname) {
		case '.js':
		contentType = 'text/javascript';
		break;
		case '.css':
		contentType = 'text/css';
		break;
		case '.pdf':
		contentType = 'application/pdf';
		break;
	}

	fs.exists(filePath, function(exists) {
		if (exists) {
			fs.readFile(filePath, function(error, content) {
				if (error) {
					response.writeHead(500);
					response.end();
				}
				else {
					response.writeHead(200, { 'Content-Type': contentType });
					response.end(content, 'utf-8');
				}
			});
		}
		else {
			response.writeHead(404);
			response.end();
		}
	});

}

function handler (request, response) {
	var filePath = '.' + request.url;

	if(request.url == '/sendemail' && request.method.toLowerCase() == 'post'){
		handleEmailRequest(request, response);
	} else if(request.url == '/upload' && request.method.toLowerCase() == 'post') {
		handleUpload(reqeust, response);
	} else {
		if (filePath == './') {
			filePath = './index.html';
		}
		handleServePage(request, response, filePath);
	}
}




function generateRandomID(){ //5 digit
	var id = Math.floor((Math.random()*99999)+10000);
	ids = [];
	if(io.sockets.clients().length == 1) return id;
	for(var i = 0; i < io.sockets.clients().length - 1; i++)
		//if(io.sockets.clients()[i].clientType == ClientType.BROWSER)
	ids.push(io.sockets.clients()[i].myid);

	while(ids.indexOf(id) != -1) {
		id = Math.floor((Math.random()*99999)+10000);
	}
	return id;
}


function findClientByID(type, id){
	for(var i = 0; i < io.sockets.clients().length; i++)
		if(io.sockets.clients()[i].clientType == type && io.sockets.clients()[i].myid == id) {
			return io.sockets.clients()[i];
		}
	return 0;
}
function findBrowserInSession(bID){ //returns the device paired with the browser client with the ID = bID or 0 if the browser client is not in session
	for(var i = 0; i < io.sockets.clients().length; i++)
		if(session[io.sockets.clients()[i].myid] == bID) return io.sockets.clients()[i];
	return 0;
}

function doDisconnect(socket){
	if(socket.clientType == ClientType.ANDROID){
		console.log("Device with ID " + session[socket.myid] + " disconnected.");
		if(findBrowserInSession(session[socket.myid])){
			var obj = findClientByID(ClientType.BROWSER, session[socket.myid]);
			if(obj != 0) obj.emit(Event.DEVICE_DISCONNECTED);
			for(var j = 0; !isUndefined(myFiles[socket.myid]) && j < myFiles[socket.myid].length; j++)
			{
				var photofile = myFiles[socket.myid][j];
				fs.unlink(photofile, function (err) {
					if (err) throw err;
					console.log('successfully deleted photo: ' + photofile);
				});
			}
		}
	}
}


function idNotFound(id) {
	return (socketMap[id] == null || isUndefined(socketMap[id]));
}

//simple mapping from browserID to androidID.
var sessionMap = {};
//simple mapping from socket.id to socket.
var socketMap = {};
function pairClients(data, socket) {
//this request has to be made by an android client
	var browserID = data.browserID;
	var androidID = data.androidID;

	if(idNotFound(browserID)){
		socket.emit(Event.BAD_BROWSER_ID);
		//error. notify clients;
		return;
	}

	//check if the browser is already in a session
	if(sessionMap[browserID] != null || !isUndefined(sessionMap)){
		//browser already in session. notify android client.
	}

	//clients are ready to be paired.
	sessionMap[browserID] = androidID;
	sessionMap[androidID] = browserID;

	//prepare an empty Array for images
	sessionMap[browserID].images = new Array();

	//send browser size to android to optimze the images before uploading.
	var browserW = socketMap[browserID].width;
	var browserH = socketMap[browserID].height;
	socket.emit(Event.SEND_BROWSER_SIZE, {width: browserW, height: browserH});
	console.log("Starting session with android ID: " + androidID + " and browser ID: " + browserID);
}

function changeSlideInBrowser(data, android_socket){
	var browserId = sessionMap[android_socket.id];
	var browserSocket = socketMap[browserId];
	browserSocket.emit(Event.GO_TO_SLIDE, data);
	
}

function pushImageToBrowser(data, android_socket) {

	var browserId = sessionMap[android_socket.id];
	console.log("trying to send image from " + android_socket.id + " to " + browserId);
	var browserSocket = socketMap[browserId];
	browserSocket.emit(Event.IMAGE_PUSH, data);
}


function handleClientConnected(data, socket) {
	console.log("handling client");
	console.log(data);
	if(data.type == ClientType.BROWSER) 
	{
		socket.clientType = ClientType.BROWSER;
		console.log("browser_id = " + socket.id);
	}
	else if(data.type == ClientType.ANDROID)
	{
		socket.clientType = ClientType.ANDROID;
		console.log("android_id = " + socket.id);
	}

	socketMap[socket.id] = socket;
	
}

function sendIdToClient(socket){
	socket.emit(Event.ID_GENERATED, {id: socket.id});
}

io.sockets.on(Event.CONNECTION, function (socket) {
	
	socket.on(Event.DISCONNECT, function() {
		doDisconnect(socket);
	});

	socket.emit(Event.REQUEST_CLIENT_TYPE);

	socket.on(Event.REQUEST_ID, function() {
		sendIdToClient(socket);
	});

	socket.on(Event.PAIR_CLIENTS, function(data){
		pairClients(data, socket);
	});

	socket.on(Event.BROWSER_WINDOW_SIZE, function(data) {
		socket.width = data.width;
		socket.height = data.height;
		console.log(socket.width + "x" + socket.height);
	});

	socket.on(Event.CHANGE_SLIDE_IN_BROWSER, function(data) {
		changeSlideInBrowser(data, socket);
	});	

	socket.on(Event.PUSH_IMAGE_TO_BROWSER, function(data) {
		pushImageToBrowser(data, socket);
	});

	socket.on(Event.CLIENT_TYPE, function(data) {
		console.log(Event.CLIENT_TYPE + " event occured. " + data);
		handleClientConnected(data, socket);
	});
});