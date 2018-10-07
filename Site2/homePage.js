class HomePage {
	constructor(appjs) {
		if (typeof appjs === "string" || appjs instanceof String)  {
			let str = appjs.replace(/''/g, "'");
			this.appCfg = JSON.parse(appjs);
			this.maker = 1;
		} else
			this.appCfg = appjs;
		this.maker = 0;
	}

	/*
	 * custom home decoders
	 * retourne l'URL de redirection depuis une URL "home" de l'application app
	 */ 
	getHome(path, qs){
		if (typeof qs === "string" || qs instanceof String)
			qs = this.qsAsObject(qs);
		if (this.appCfg.syntax == "s1")
			return this.s1(path, qs);
		else
			return null;
	}
	
	build() { 
		return this.appCfg.builds[0];
	}

	app() { 
		return this.appCfg.name;
	}

	s1(path, qs){
		qs.app = this.appCfg.name;
		qs.maker = this.maker;
		if (qs.build && !Number.isInteger(qs.build))
			qs.build = parseInt(qs.build, 10);
		qs.b = qs.build && this.appCfg.builds.indexOf(qs.build) != -1 ? qs.build : this.appCfg.builds[0];
		qs.builds = this.appCfg.builds;
		
		let i = path.lastIndexOf("/");
		const home1 = i == -1 ? path : path.substring(i + 1);
		let mode, home2;
		i = home1.lastIndexOf(".");
		if (i == -1) {
			mode = 1;
			home2 = home1;
		} else {
			let ext = home1.substring(i + 1);
			home2 = home1.substring(0, i);
			if (ext.startsWith("a")) 
				mode = 2;
			else if (ext.startsWith("i") || ext == "html")
				mode = 0;
			else 
				mode = 1;				
		}
		qs.mode = mode;
		
		let shortcuts = this.appCfg.options && this.appCfg.options.shortcuts ? this.appCfg.options.shortcuts : {};
		let orgHome = home2;
		if (!home2)
			orgHome = shortcuts["?"];
		else {
			i = home2.indexOf("-");
			if (i == -1) {
				let x = shortcuts[home2];
				orgHome = x ? x : home2 + "-index";
			}
		}
		i = orgHome.indexOf("-");
		qs.org = orgHome.substring(0, i);
		qs.home = orgHome.substring(i + 1);
		let homes = this.appCfg.options && this.appCfg.options.homes ? this.appCfg.options.homes : [];
		if (!homes.length) homes.push("index");
		if (homes.indexOf(qs.home) == -1) qs.home = homes[0];
		
		qs.svc = this.servicesOfOrgInApp(this.appCfg, qs.org);
		if (!qs.svc) return null;
		
		let u = this.appCfg.staticUrl && this.appCfg.debug == qs.b ? this.appCfg.staticUrl : this.appCfg.url + "$R/" + qs.app + "/" + qs.b ;
		let qj = encodeURIComponent(JSON.stringify(qs));
		return u + "/" + qs.home + ".html?" + qj;
	}
	
	servicesOfOrgInApp(app, org) {
		let res = {};
		let ok = false;
		for(let i = 0, s = null; s = app.services[i]; i++)
			if (s.orgs.has(org)) {
				res[s.svc] = {url:s.url, build:s.build};
				ok = true;
			}
		return ok ? res : null;
	}

	qsAsObject(q){
		const qs = {}
		if (q && q.length > 1) {
			if (q.startsWith("?")) q = q.substring(1);
			let args = q.split("&");
			if (args && args.length) {
				for(let i = 0, arg = null; arg = args[i]; i++){
					if (arg) {
						let j = arg.indexOf("=");
						if (j == -1 ) qs[arg] = ""; else { if (j) qs[arg.substring(0,j)] = arg.substring(j + 1); }
					}
				}
			}
		}
		return qs;
	}
}
	
if (!(typeof exports === undefined)) exports.HomePage = HomePage;
