
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
		let d = path.normalize(a.buildspaths[0]);
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
			let p = path.normalize(s.svc.buildspaths[i] + "root.js");
			r[id] = require(p).ExecCtx;
		}
	}
	return r;
}

function headers(mime, origin, xch) {
	const h = {}
    h['Content-type'] = cfg.mimeOf(mime) + "; charset=utf-8";
    if (origin && origin != "null") {
        h['Access-Control-Allow-Origin'] = origin;
        h['Access-Control-Allow-Headers'] = 'X-Custom-Header';
    }
    if (xch)
        h['X-Custom-Header'] = JSON.stringify(xch);
    return h;
}

const errMsg = {
	"BORG1":"origne de l'opération non acceptée",
	"BORG2":"organisation gérée par un autre processus pour le service demandé",
	"BORG3":"organisation non gérée pour le service demandé",
	"BMIN":"Build supportée par l'application [{0}] pour ce service absente du X-Custom-Header ou de niveau insuffisant, [{1}] requis au minimum"
}

async function oper(req, res) {
	let execCtx;
	let origin;
	let certDN = getCertDN(req);
	try {
		origin = req.headers["origin"];
		if (req.method == "OPTIONS") {
			res.status(200).set(headers(cfg.mimeOf("txt"), origin)).send("");
			return;
		}
		let p = req.path.substring(1);
		let i = p.indexOf("/");
		let j = p.indexOf("/", i + 1);
		let svc = p.substring(0, i);
		let org = p.substring(i + 1, j);
		let opetc = p.substring(j + 1);
		let [e, s] = cfg.buildOfSvcForOrg(svc, org, origin);
		if (!e) {
			let xch = getXch(req);
			let buildmin = xch.build ? xch.build : 0;
			if (buildmin >= (s.buildmin ? s.buildmin : 0)) {
				let execCtxClass= opModules[svc + "/" + s.build];
				execCtx = new execCtxClass(req, cfg, s, org, opetc, xch, certDN, buildmin);
				let result = await execCtx.go();
				result.close();
				res.status(200).set(headers(result.mime, origin, execCtx ? execCtx.respXCH : null)).send(result.bytes);
			} else {
				// Build min dans XCH non respectée ou pas de XCH
				let err = {err:"BBM", info:errMsg["BBM"], args:[buildmin, s.buildmin ? s.buildmin : 0], phase:0};
				res.status(200).set(headers("text/javascript", origin)).send(JSON.stringify(err));				
			}
		} else {
			// 1:origine 2:org supportée par autre process 3:org non supportée
			let c = "BORG"  + e; 
			let err = {err:c, info:errMsg[c], args:buildOrUrl, phase:0};
			res.status(200).set(headers(cfg.mimeOf("js"), origin)).send(JSON.stringify(err));
		}
	} catch(e) {
		let err;
		if (e.constructor.name == "AppExc") {
			if (logLvl > 1) console.log(e.message);
			err = {err:e.err, info:e.message, args:e.args};
		} else {
			let stack = e.stack ? e.stack : "";
			let msg = e.message ? e.message : "?";
			err = {err:"BU3", info:msg, args:[]};
			if (stack) err.tb = stack;
			if (logLvl > 0) console.log(msg + (stack ? "\n" + stack : ""));
		}
		err.phase = execCtx ? execCtx.phase : 0;
		let txt = JSON.stringify(err);
		res.status(200).set(headers("json", origin, execCtx ? execCtx.respXCH : null)).send(txt);
	}
}

function getXch(req) {
	let xchjson = req.headers["x-custom-header"];
	if (!xchjson) {
		xchjson = req.body ? req.body["X-Custom-Header"] : null;
		if (!xchjson)
			xchjson = req.query ? req.query["X-Custom-Header"] : null;
	}
	if (!xchjson) return {};
    try {
        return JSON.parse(xchjson);
    } catch (e) {
    	return {};
    }
}

function getCertDN(req) {
	let sdn = req.headers["ssl_client_s_dn"];
	if (sdn) {
		let dn = {}
		let x = sdn.split(",");
		for(let i = 0; i < x.length; i++) {
			let y = x[i];
			if (y.length >= 3) {
				let j = y.indexOf("=");
				if (j > 0 && j < y.length) {
					let k = y.substring(0,j);
					let v = y.substring(j+1);
					dn[k.trim()] = v.trim();
				}
			}
		}
		return dn;
	} else if (req.socket.getPeerCertificate) {
		let cert = req.socket.getPeerCertificate();
		return cert ? cert.subject : null;
	} else
		return null;
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
if (cfg.error) {
	console.log(cfg.error);
	throw cfg.error;
}
let logLvl = cfg.options["log" + processusName];
if (!logLvl) logLvl = 0;

const filesByApp = getFilesByApp();
const opModules = requireOpModules();

const app = express();

/**** appels des opérations des services    ****/
app.use("/[\$]O/", upload.any(), bodyParser.urlencoded({ extended: false }), async (req, res) => { await oper(req, res); });

/**** favicon.ico du sites ****/
app.use("/favicon.ico", (req, res) => {
	try {
		res.status(200).set("Content-type", cfg.mimeOf("ico")).send(favicon);
	} catch(e) { 
		res.status(404).send(e.message);
	}
});

/**** ping du site ****/
app.use("/ping", (req, res) => {
	try {
		res.status(200).set("Content-type",  cfg.mimeOf("js") + "; charset=utf-8").send(new Date().toISOString());
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
			let p = path.normalize(a.buildspaths[i]);
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
					"Content-type": cfg.mimeOf("js") + "; charset=utf-8",
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
		let certDN = getCertDN(req);
		if (certDN) console.log(JSON.stringify(certDN));
		let ok = false;
		for(let ax in cfg.apps) {
			let a = cfg.apps[ax];
			if (a.hostname == req.hostname && req.path.startsWith(a.prefix)) {
				let [mode, redir] = new HomePage(a).getHome(req.path, req.query);
				if (redir) {
					console.log(req.path + " ==redir==> " + decodeURIComponent(redir));
					let text = "<html><head><meta http-equiv='refresh' content='0;URL=" + redir + "'></head><body></body></html>";
					res.status(200).set({
						"Content-type": "text/html",
						"Cache-control": "no-cache, no-store, must-revalidate"
					}).send(text);
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
let options1 = {key:key, cert:cert }
let options2 = {key:key, cert:cert,	requestCert: true, rejectUnauthorized:false }

for(let i = 0, l = null; l = cfg.currentProcessus.listen[i]; i++) {
	if (!l[2])
		http.createServer(app).listen({host:l[0], port:l[1]}, () => {
			console.log("HTTP server running at " + l[0] + ":" + l[1]);
		});
	else {
		https.createServer(l[2] == 1 ? options1 : options2, app).listen({host:l[0], port:l[1]}, () => {
			console.log("HTTP/S server running at " + l[0] + ":" + l[1]);
		});		
	}
}
