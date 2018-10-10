class Config {
	err(msg) {
		this.error = msg;
		return this;
	}
	
	setup(configjson, secretsjson, currentProcessus, rootDir){
		let c;
		try {
			c = JSON.parse(configjson);
			this.secrets = JSON.parse(secretsjson);
		} catch(e) {this.error = e.message; return this;}
		
		this.currentProcessus = currentProcessus;
		this.rootDir = rootDir;
		
		this.urls = c.urls;
		
		this.origins = {};
		if (c.origins && c.origins.length) {
			for(let i = 0, x = null; x = c.origins[i]; i++) {
				if (x.length == 0) continue;
				let n = x[0];
				if (this.origins[n]) return this.err("origins : duplicate entry " + n);
				let v = new Set();
				this.origins[n] = v;
				for(let j = 1; j < x.length; j++){
					let t = x[j];
					if (!t) continue;
					let lx = this.origins[t];
					if (lx)
						for(let vx in lx) v.add(vx);
					else {
						if (t.startsWith("-"))
							v.delete(t.substring(1));
						else
							v.add(t);
					}
				}
			}
		}
		
		this.orgs = {};
		if (c.orgs && c.orgs.length) {
			for(let i = 0, x = null; x = c.orgs[i]; i++) {
				if (x.length == 0) continue;
				let n = x[0];
				if (this.orgs[n]) return this.err("orgs : duplicate entry " + n);
				let v = new Set();
				this.orgs[n] = v;
				for(let j = 1; j < x.length; j++){
					let t = x[j];
					if (!t) continue;
					let lx = this.orgs[t];
					if (lx)
						for(let vx in lx) v.add(vx);
					else {
						if (t.startsWith("-"))
							v.delete(t.substring(1));
						else
							v.add(t);
					}
				}
			}
		}
		
		this.options = c.options ? c.options : {};
		
		this.apps = {};
		if (c.apps)
			for(let app in c.apps) {
				let x = c.apps[app];
				if (this.apps[app]) return this.err("apps." + app + " : duplicate entry");
				if (!x.url) return this.err("apps." + app + " : no url");
				let u = this.urls[x.url];
				if (!u) return this.err("apps." + app + " : no url");
				if (!u.endsWith("/")) u += "/";
				let i = u.indexOf("://");
				if (i == -1) return this.err("apps." + app + " : no valid url " + u);
				let j = u.indexOf("/", i + 3);
				if (j == -1) return this.err("apps." + app + " : no valid url " + u);
				let origin = u.substring(i + 3, j);
				let prefix = u.substring(j);
				j = origin.indexOf(":");
				let hostname = j == -1 ? origin : origin.substring(0, j);
				
				for(let ax in this.apps) {
					let ux = this.apps[ux].u;
					if (ux.startsWith(u) || u.startsWith(u) || u == ux)
						return this.err("apps." + app + "/" + ax + " : conflicting urls");
				}
				
				if (!x.syntax) return this.err("apps." + app + " : no syntax");
				let v = {name:app, url:u, prefix:prefix, hostname:hostname, origin:origin, syntax:x.syntax};

				let p = c.paths[app];
				if (!p) return this.err("apps." + app + " : no path");
				if (!p.endsWith("/")) p += "/";
				v.path = this.rootDir + p;
				this.apps[app] = v;

				let dbg = x.debug ? x.debug : 0;
				let bd = x.builddir ? x.builddir : "/";
				v.debug = dbg;
				v.builds = x.builds ? x.builds : [];
				v.buildspaths = new Array(v.builds.length);
				for(let i = 0; i < x.builds.length; i++){
					let b = x.builds[i];
					if (!b) b = 0;
					if (b == dbg)
						v.buildspaths[i] = v.path;
					else 
						v.buildspaths[i] = v.path + bd + b + "/";
				}
				if (x.staticUrl) {
					let u = this.urls[x.staticUrl];
					if (!u) return this.err("apps." + app + " : no staticUrl");
					v.staticUrl = u;
				}
				if (x.options) {
					let op = this.options[x.options];
					if (!op) return this.err("apps." + app + " : no options");
					v.options = op;
				}
				
				v.services = new Array(x.services ? x.services.length : 0);
				let svorgs = {};
				for(let i = 0; i < v.services.length; i++) {
					let it1 = x.services[i];
					let it2 = {};
					v.services[i] = it2;
					if (!it1.svc) return this.err("apps." + app + " : no svc for item " + i);
					if (!svorgs[it1.svc]) svorgs[it1.svc] = new Set();
					let orgs = svorgs[it1.svc];
					it2.svc = it1.svc;
					if (!it1.build) return this.err("apps." + app + " : no build for item " + i);
					it2.build = it1.build;
					if (!it1.url) return this.err("apps." + app + " : no url for item " + i);
					let u = this.urls[it1.url];
					if (!u) return this.err("apps." + app + " : no url for item " + i);
					it2.url = u;
					if (!it1.orgs) return this.err("apps." + app + " : no orgs for item " + i);
					let og = this.orgs[it1.orgs];
					if (!og) return this.err("apps." + app + " : no orgs for item " + i);
					it2.orgs = {};
					for(let org of og){
						if (orgs.has(org)) 
							return this.err("apps." + app + " : org " + org + " duplicate for svc " + svc + " for item " + i);
						orgs.add(org);
						it2.orgs[org] = true;
					}
				}
			}
		
		this.databases = c.databases ? c.databases : {};
		for(let db in this.databases) {
			let x = this.databases[db];
			if (!x.host) return this.err("databases." + db + " : no host");
			let h = this.urls[x.host];
			if (!h) return this.err("databases." + db + " : no host");
			x.host = h;
			x.name = db;
			let pwd = this.secrets[db];
			if (!pwd) return this.err("databases." + db + " : no password in secrets.json");
			x.password = pwd;
		}
		
		this.services = {};
		if (c.services)
			for(let svc in c.services) {
				let x = c.services[svc];
				if (this.services[svc]) return this.err("services." + svc + " : duplicate entry");
				let p = c.paths[svc];
				if (!p) return this.err("servives." + svc + " : no path");
				if (!p.endsWith("/")) p += "/";
				let v = {name:svc, path:this.rootDir + p};
				this.services[svc] = v;
				let dbg = x.debug ? x.debug : 0;
				let bd = x.builddir ? x.builddir : "/";
				if (!x.builds || !x.builds.length) return this.err("services." + svc + " : invalid builds");
				if (!x.buildsmin || x.buildsmin.length != x.builds.length) 
					return this.err("services." + svc + " : invalid buildsmin length ");
				for(let i = 0; i < x.builds.length; i++){
					let b = x.builds[i];
					if (!Number.isInteger(b) || b <= 0) return this.err("services." + svc + " : invalid build " + b);
				}
				for(let i = 0; i < x.buildsmin.length; i++){
					let b = x.buildsmin[i];
					if (!Number.isInteger(b) || b > x.builds[i]) 
						return this.err("services." + svc + " : invalid buildmin " + b);
				}
				v.builds = x.builds;
				v.buildsmin = x.buildsmin;
				v.buildspaths = new Array(v.builds.length);
				for(let i = 0; i < x.builds.length; i++){
					let b = x.builds[i];
					if (!b) b = 0;
					if (b == dbg)
						v.buildspaths[i] = v.path;
					else 
						v.buildspaths[i] = v.path + bd + b + "/";
				}
				if (x.options) {
					let op = this.options[x.options];
					if (!op) return this.err("services." + svc + " : no options");
					v.options = op;
				}
				v.langs = x.langs && x.langs.length ? x.langs : ["fr"];
			}
		
		this.processus = {};
		if (c.processus)
			for(let proc in c.processus) {
				let x = c.processus[proc];
				if (!proc || this.processus[proc]) 
					return this.err("processus." + proc + " : duplicate entry");
				let type = "NP".indexOf(proc.charAt(0))
				if (type == -1) return this.err("processus." + proc + " : unknown type");
				let v = {type:type};
				this.processus[proc] = v;				
				if (x.listen) {
					if (x.listen.length < 2 || x.listen.length > 3) 
						return this.err("processus." + proc + " : no valid listen");
					let ip = this.urls[x.listen[0]];
					if (!ip) return this.err("processus." + proc + " : no valid listen ip");
					v.ip = ip;
					if (!Number.isInteger(x.listen[1]) || x.listen[1] < 0) 
						return this.err("processus." + proc + " : no valid listen ssl port");
					v.sslport = x.listen[1];
					if (x.listen.length == 3) {
						if (!Number.isInteger(x.listen[2]) || x.listen[2] < 0) 
							return this.err("processus." + proc + " : no valid listen port");
						v.port = x.listen[2];
					} else
						v.port = 0;
				}
				if (x.static && v.type == 0) v.static = true;
				
				v.services = new Array(x.services ? x.services.length : 0);
				v.svorgs = {};
				for(let i = 0; i < v.services.length; i++) {
					let it1 = x.services[i];
					let it2 = {};
					v.services[i] = it2;
					if (!it1.svc) return this.err("processus." + proc + " : no svc for item " + i);
					let svx = this.services[it1.svc];
					if (!svx) return this.err("processus." + proc + " : no valid svc for item " + i);
					it2.svc = svx;
					if (it1.db) {
						let db = this.databases[it1.db];
						if (!db) return this.err("processus." + proc + " : no db for item " + i);
						it2.db = db;
					}
					if (!v.svorgs[it1.svc]) v.svorgs[it1.svc] = {};
					let orgs = v.svorgs[it1.svc];
					if (it1.build === undefined || !Number.isInteger(it1.build) || it1.build < 0 || it1.build >= svx.builds.length) 
						return this.err("processus." + proc + " : no build for item " + i);
					it2.build = svx.builds[it1.build];
					it2.buildmin = svx.buildsmin[it1.build];
					if (!it1.origins) return this.err("processus." + proc + " : no origins for item " + i);
					let orig = this.origins[it1.origins];
					if (!orig) return this.err("processus." + proc + " : no valid origins for item " + i);
					v.origins = orig;
					if (!it1.orgs) ("processus." + proc + " : no orgs for item " + i);
					let og = this.orgs[it1.orgs];
					if (!og) return this.err("process." + proc + " : no orgs for item " + i);
					it2.orgs = og;
					for(let org of it2.orgs){
						if (orgs[org]) 
							return this.err("process." + proc + " : org " + org + " duplicate for svc " + it1.svc + " for item " + i);
						else
							orgs[org] = it2.build;
					}
				}
				if (v.type == 1 && v.services.length > 1) 
					return this.err("processus." + proc + " : type Python and multiple services");
			}
		this.types = c.types ? c.types : {};
		let cp = this.processus[this.currentProcessus];
		if (!cp) return this.err("processus." + this.currentProcessus + " : current process unknown");
		this.currentProcessus = cp;
		this.logLevel = this.options["log" + this.currentProcessus.name];
		if (this.logLevel) logLevel = 0;
		return this;
	}
	
	mimeOf(code) {
	    if (!code) return "application/octet-stream";
	    if (code.indexOf("/") != -1) return code;
	    let t = this.types[code];
	    return t ? t : "application/octet-stream";
	}

	serial(app) {
		return JSON.stringify(app).replace(/'/g, "''");
	}
	
	buildOfSvcForOrg(svc, org, origin){
		for(let k = 0, s = null; s = this.currentProcessus.services[k]; k++) {
			if (!s.orgs.has(org)) continue;
			return s.origins.has(origin) ? [0, s] : [1, ""];
		}
		for(let proc in this.processus) {
			let p = this.processus[proc];
			for(let i = 0, s = null; s = p.services[i]; i++) {
				if (s.orgs[org]) {
					let url = p.sslport ? "https://" + p.ip + ":" + p.sslport + "/" 
						: "http://" + p.ip + ":" + p.port + "/";
					return [2, url]
				}
			}
		}
		return [3, ""];
	}
		
	/*
	buildFrom(proc, svc, org){
		return proc && svc && org && proc[svc.name] ? proc[svc.name][org] : 0;
	}
	
	appFromUrl(url) {
		for(let app in this.apps)
			if (url.startsWith(this.apps[app].url)) return app;
		return null;
	}
	*/
		
}

exports.Config = Config;