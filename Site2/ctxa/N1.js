
function browse(path, list, pfx) {
	try {
		let items = fs.readdirSync(path);
		for(let i = 0, file = null; file = items[i]; i++){
			if (fs.statSync(path + '/' + file).isDirectory())
				browse(path + "/" + file, list, pfx + "/" + file);
			else
				list.push('"' + pfx + "/" + file + '"');
		};
	} catch(e) { throw e;}
}

function getFilesByApp() {
	const lst = {};
	for(let ax in cfg.apps) {
		let a = cfg.apps[ax];
		let d = a.buildspaths[0];
		let b = a.builds[0];
		let lx = [];
		browse(d, lx, a.prefix + "$R/" + ax + "/" + b );
		lst[ax] = "const files = [\n" + lx.join(",\n") + "\n];\n";
		// console.log(lst[ax]);
	}
	return lst;
}

function swjsByApp(app) {
	let sep = "\n/***********************************/\n";
	let appcfg = "const appConfigJson = '" + cfg.serial(cfg.apps[app]) + "';"
	return filesByApp[app] + sep + homepagejs + sep + appcfg + sep + swjs; 
}

function requireOpModules(){
	let r = {};
	for(let i = 0, s = null; s = cfg.currentProcessus.services[i]; i++) {
		let b = s.build;
		let id = s.svc.name + "/" + b;
		if (!r[id]) {
			let i = s.svc.builds.indexOf(b);
			r[id] = require(s.svc.buildspaths[i] + "root.js").oper;
		}
	}
	return r;
}

const path = require('path');
const processusName = path.basename(__filename, ".js");
const rootDir = path.normalize(__dirname + "/..") + "/";

const fs = require("fs");
const http = require("http");
const https = require("https");
const express = require('express');
const serveStatic = require('serve-static');
const bodyParser = require('body-parser');
const multer  = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const Config = require("./config.js").Config;
const HomePage = require("../homePage.js").HomePage;

const key = fs.readFileSync(rootDir + "/cert/privkey.pem");
const cert = fs.readFileSync(rootDir + "/cert/fullchain.pem");
const secretsjson = fs.readFileSync(rootDir + "/cert/secrets.json");
const favicon = fs.readFileSync(rootDir + "/favicon.ico");
const swjs = fs.readFileSync(rootDir + "/sw.js");
const homepagejs = fs.readFileSync(rootDir + "/homePage.js");
const configjson = fs.readFileSync(rootDir + "/config.json");
const cfg = new Config().setup(configjson, secretsjson, processusName, rootDir);
exports.cfg = cfg;
if (cfg.error) {
	consoloe.log(cfg.error);
	throw cfg.error;
}

const filesByApp = getFilesByApp();
const opModules = requireOpModules();

const app = express();

/**** appels des opérations des services    ****/
app.use("/[\$]O/", async (req, res) => {
	try {
		let p = req.path.substring(4);
		let i = p.indexOf("/");
		let j = p.indexOf("/", i + 1);
		let svc = p.substring(0, i);
		let org = p.substring(i + 1, j);
		let ok = false;
		for(let k = 0, s = null; s = cfg.currentProcessus.services[k]; k++) {
			let x = s.svorgs[svc];
			if (!x) continue;
			let b = x[org];
			if (!b) continue;
			let opRoot = opModules (svc + "/" + org);
			if (!opRoot) continue;
			await opRoot(req, res);
			ok = true;
			break;
		}
		if (!ok)
			res.status(404).send("service / org ???");
	} catch(e) { 
		res.status(404).send(e.message);
	}
});

/**** favicon.ico du sites ****/
app.use("/favicon.ico", (req, res) => {
	try {
		res.status(200).set("Content-type",  "image/x-icon").send(favicon);
	} catch(e) { 
		res.status(404).send(e.message);
	}
});

/**** ping du site ****/
app.use("/ping", (req, res) => {
	try {
		res.status(200).set("Content-type",  "text/javascript; charset=utf-8").send(new Date().toISOString());
	} catch(e) { 
		res.status(404).send(e.message);
	}
});


/**** ressources statiques des applications ****/
if (cfg.currentProcessus.static) {
	for(let ax in cfg.apps) {
		let a = cfg.apps[ax];
		for(let i = 0; i < a.builds.length; i++) {
			let b = a.builds[i];
			if (a.debug && a.debug == b && a.staticUrl) continue;
			let p = a.buildspaths[i];
			let pfx = a.prefix + "[\$]R/" + ax + "/" + b + "/";
			// console.log("static : " + pfx + "  => " + p);
			app.use(pfx, serveStatic(p, {fallthrough:false}));
		}
	}
}

/**** scripts Service Workers des applications ****/
for(let ax in cfg.apps) {
	app.use(cfg.apps[ax].prefix + "[\$]S/" + ax + ".js", (req, res) => {
		try {
			let i = req.originalUrl.indexOf("/$S/");
			let x = req.originalUrl.substring(i + 4);
			let axx = x.substring(0, x.length - 3);
			let text = swjsByApp(axx);
			if (!text)
				res.status(404).send("application ???");
			else
				res.status(200).set({
					"Content-type": "text/javascript; charset=utf-8",
					"Service-Worker-Allowed": "/"
				}).send(text);
		} catch(e) { 
			res.status(404).send(e.message);
		}
	});
}

/**** home pages des applications ****/
app.use("/", (req, res) => {
	try {
		let ok = false;
		for(let ax in cfg.apps) {
			let a = cfg.apps[ax];
			if (a.hostname == req.hostname && req.path.startsWith(a.prefix)) {
				let [mode, redir] = new HomePage(a).getHome(req.path, req.query);
				if (redir) {
					console.log(req.path + " ==redir==> " + decodeURIComponent(redir));
				    res.redirect(redir);
				    ok = true;
				    break;
				}
			}
		}
		if (!ok)
			res.status(404).send("application / organisation ???");
	} catch(e) { 
		res.status(404).send(e.message);
	}
});

/****** starts listen ***************************/
let ip = cfg.currentProcessus.ip;
let p1 = cfg.currentProcessus.sslport;
let p2 = cfg.currentProcessus.port;
if (p2)
	http.createServer(app).listen({host:ip, port:p2}, () => {
		console.log("Server running at " + ip + ":" + p2);
	});
if (p1)
	https.createServer({key:key, cert:cert}, app).listen({host:ip, port:p1}, () => {
		console.log("Server running at " + ip + ":" + p1);
	});

