const cfg = new Cfg(appConfigJson);
const build = cfg.builds[0];
const cachename = "B" + build;

const TIME_OUT_MS = 30000;
const encoder = new TextEncoder("utf-8");

this.addEventListener('install', event => {
	this.skipWaiting();
	event.waitUntil(
		caches.open(cachename).then(cache => cache.addAll(files))
	);
});

this.addEventListener('activate', event => {
	event.waitUntil(
		clients.claim();
	    caches.keys().then(keys => Promise.all(
	    	keys.map(key => {
	    		if (key != cachename) {
	    			return caches.delete(key);
	    		}
	    	});
	    )).then(() => {
	    	console.log(cachename + ' now ready to handle fetches!');
	    })
	);
});



const nf404 = function(m, u) {
	let txt = encoder.encode(m + " : " + u);
	const headers = new Headers();
	headers.append("Content-Type", "text/plain; charset=utf-8");
	headers.append("Cache-control", "no-store");
	headers.append("Content-Length", "" + txt.length);
	return new Response(txt, {status:404, statusText:"Not Found", headers:headers});
}


const fetchTO = async function(req, timeout) {
	let resp;
	try {
		let controller, signal, tim;
		if (timeout) {
			controller = new AbortController();
			signal = controller.signal;
			tim = setTimeout(() => { controller.abort(); }, timeout);
		}
		/*
		 * exception : Cannot construct a Request with a Request whose mode is 'navigate' and a non-empty RequestInit
		 * quand on fetch une page. 
		 * D'ou ne passer que l'url quand on fetch une ressouce (timeout != 0)
		 */
		resp = await fetch(timeout ? req.url : req, {signal});
		if (timeout && tim) 
			clearTimeout(tim);
		return resp;
	} catch (e) {
		if (timeout)
			return nf404("Exception : " + e.message + " sur fetch ressource", req.url);
		else
			return resp;
	}
}

// recherche dans les caches : si build recherche au serveur et garde la réponse en cache de la build citée
const fetchFromCaches = async function(req, build) {
	let u = req.url;
	let search = "";
	let i = req.url.lastIndexOf("?")
	if (i != -1) {
		u = req.url.substring(0,i);
		search = req.url.substring(i);
	}
	let html = u.endsWith(".html");
	let resp = await caches.match(u);
	if (resp && resp.ok) {
		if (TRACEON2) console.log("fetch OK du CACHE : " + req.url);
		return resp;
	}
	resp = await fetchTO(req.clone(), TIME_OUT_MS);
	if (!resp || !resp.ok || !build)
		return resp;
	let cachename = (cp ? cp : "root") + "_" + build;
	let cache = await caches.open(cachename);
	await cache.put(req.clone, resp.clone());
	if (TRACEON2) console.log("PUT dans CACHE : " + req.url);
	return resp;
}


const fetchHome = async function(org, home, build, mode, qs){
    let x = "$build=" + BC + "&$org=" + org + "&$home=" + home + "&$mode=" + mode + "&$cp=" + cp + "&$appstore=" + dyn_appstore + "&$maker=Service-Worker"  
    let redir = static_appstore + build + "/" + home + ".html" + (qs ? qs + "&" : "?") + x
	let txt = encoder.encode("<html><head><meta http-equiv='refresh' content='0;URL=" + redir + "'></head><body></body></html>");
	const headers = new Headers();
	headers.append("Content-Type", "text/html");
	headers.append("Cache-control", "no-cache, no-store, must-revalidate");
	headers.append("Content-Length", "" + txt.length);
	return new Response(txt, {status:200, statusText:"OK", headers:headers});
}

this.addEventListener('fetch', async event => {
	let url = event.request.url;
	let i = url.indexOf("//");
	let j = url.indexOf("/", i + 2);
	// ce qui suit le site AVEC /
	let p = j != -1 ? (j == url.length - 1 ? "/" : url.substring(j);) : "/";
	i = p.indexOf("?");
	let path = i == -1 ? p : p.substring(0,i);
	let qs = i == -1 ? "" : p.substring(i);
	
	i = path.indexOf("/$O/");
	if (i != -1) {
		event.respondWith(fetch(event.request));
		return;
	}
	
	i = path.indexOf("/$S/");
	if (i != -1) {
		event.respondWith(fetchTO(event.request, TIME_OUT_MS));
		return;
	}
	
	i = path.indexOf("/$R/");
	if (i != -1) {
		let b = 0;
		try {
			j = path.indexOf("/", i + 1);
			i = path.indexOf("/", j + 1);
			b = parseInt(path.substring(j+1, i))
		} catch(e)
		if (b == build) {
			let cache = await caches.open(cachename);
			event.respondWith(cache.match(req.url, {ignoreSearch:true, ignoreMethod:true, ignoreVary:true}));
		} else
			event.respondWith(fetchTO(event.request, TIME_OUT_MS));
		return;
	}
	
	let [mode, redir] = new HomePage(a).getHome(req.path, req.query);
	if (mode == 2){
		// redirect local
	} else {
		event.respondWith(fetchTO(event.request, TIME_OUT_MS));
	}
});


this.addEventListener('fetch', event => {
	let now = new Date().toISOString();
	let url = event.request.url;
	if (TRACEON2) console.log("fetch event " + now + " sur: " + url);
	let i = url.indexOf("//");
	let j = url.indexOf("/", i + 2);
	let site;		// https://localhost:443     jusqu'au / SANS /
	let path;		// ce qui suit le site AVEC /
	if (j != -1) {
		site = url.substring(0, j);
		path = j == url.length - 1 ? "/" : url.substring(j);
	} else {
		path = "/";
		site = url;
	}
	
	if (path == CP + "$infoSW") {
		event.respondWith(infoSW());
		return;
	}

	if (path == CP + "$infoCACHES") {
		event.respondWith(myCaches());
		return;
	}

	if (path.startsWith(CP + "$info/") || path == CP + "$swjs" || path.startsWith(CP + "$sw.html")) {
		event.respondWith(fetchTO(event.request, TIME_OUT_MS));
		return;
	}

	if (path.startsWith(CPOP)) {
		event.respondWith(fetchTO(event.request, 0));
		return;
	}

	if (path.startsWith(CPUI)) {
		let p = path.substring(CPUI.length);
		let i = p.indexOf("/");
		let b = i != -1 ? p.substring(0, i) : "";
		event.respondWith(fetchFromCaches(event.request, b != BC ? b : null));
		return;
	}

	if (path.startsWith(CP)) {
		let p = path.substring(CP.length);
		let j = p.lastIndexOf("?");
		let home1 = p;
		let qs = ""
		if (j != -1) {
			home1 =  p.substring(0, j);
			qs = p.substring(j);
		}

		let h = analyseHome(home1, qs, shortcuts);
		// {home:home, org:org, build:build, mode:mode}
		
		if (h.mode == 2) // redirect 
			event.respondWith(fetchHome(h.org, h.home, h.build, h.mode, qs));
		else // recharge depuis le magasin d'application
			event.respondWith(fetchTO(event.request, TIME_OUT_MS));
		return;
	}
	
	event.respondWith(nf404("Syntaxe URL non reconnue", url));
});
