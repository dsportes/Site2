const hp = new HomePage(appConfigJson);
const build = hp.appCfg.builds[0];
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
	event.waitUntil(async function() {
		clients.claim();
	    await caches.keys()
	    .then(keys => Promise.all(
	    	keys.map(key => { if (key != cachename) return caches.delete(key); })
	    ));
	}());
});

const nf404 = function(m) {
	let txt = encoder.encode(m);
	const headers = new Headers();
	headers.append("Content-Type", "text/plain; charset=utf-8");
	headers.append("Cache-control", "no-store");
	headers.append("Content-Length", "" + txt.length);
	return new Response(txt, {status:404, statusText:"Not Found", headers:headers});
}

const fetchTO = async function(url, timeout) {
	try {
		let controller = new AbortController();
		let signal = controller.signal;
		let tim = setTimeout(() => { controller.abort(); }, timeout);
		let resp = await fetch(url, {signal});
		if (tim) clearTimeout(tim);
		return resp;
	} catch (e) {
		return nf404("Exception : " + e.message + " sur fetch ressource : ", url);
	}
}

const redirHome = function(redir){
	let txt = encoder.encode("<html><head><meta http-equiv='refresh' content='0;URL=" + redir + "'></head><body></body></html>");
	const headers = new Headers();
	headers.append("Content-Type", "text/html");
	headers.append("Cache-control", "no-cache, no-store, must-revalidate");
	headers.append("Content-Length", "" + txt.length);
	return new Response(txt, {status:200, statusText:"OK", headers:headers});
}

const fetchFromCache = async function(req) {
	let cache = await caches.open(cachename);
	let resp = await cache.match(req.url, {ignoreSearch:true, ignoreMethod:true, ignoreVary:true});
	return resp;
}

this.addEventListener('fetch', async event => {
	let url = event.request.url;
	let i = url.indexOf("//");
	let j = url.indexOf("/", i + 2);
	// ce qui suit le site AVEC /
	let p = j != -1 ? (j == url.length - 1 ? "/" : url.substring(j)) : "/";
	i = p.indexOf("?");
	let path = i == -1 ? p : p.substring(0,i);
	let qs = i == -1 ? "" : p.substring(i);
	
	i = path.indexOf("/$O/");
	if (i != -1) {
		event.respondWith(fetch(event.request));
		return;
	}

	if (path.endsWith("/ping")) {
		event.respondWith(fetch(event.request));
		return;
	}

	i = path.indexOf("/$S/");
	if (i != -1) {
		event.respondWith(fetchTO(url, TIME_OUT_MS));
		return;
	}
	
	i = path.indexOf("/$R/");
	if (i != -1) {
		let b = 0;
		try {
			let xx =path.split("/");
			b = parseInt(xx[3])
		} catch(e) {}
		if (b == build) {
			// console.log("cherche cache : " + url);
			event.respondWith(fetchFromCache(event.request));
		} else {
			// console.log("cherche serveur : " + url);
			event.respondWith(fetchTO(url, TIME_OUT_MS));
		}
		return;
	}
	
	let [mode, redir] = hp.getHome(path, qs);
	if (mode == 2){
		// redirect local
		if (redir)
			event.respondWith(redirHome(redir));
		else
			event.respondWith(nf404("cannot identify home page : " + url));
	} else {
		event.respondWith(fetchTO(url, TIME_OUT_MS));
	}
});
