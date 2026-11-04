// Rundlauf-Test (Node 22): node vendor-candidates/roundtrip-test.js
const V = '/home/user/elo-duell/vendor-candidates';
const qrcode = require(V + '/qrcode-generator/qrcode.js');
const jsQR = require(V + '/jsqr/jsQR.min.js');
const N = `Lissabon Barcelona Rom Florenz Venedig Paris Amsterdam Kopenhagen Stockholm Oslo Reykjavík Dublin Edinburgh London Prag Wien Budapest Krakau Dubrovnik Split Athen Santorini Kreta Mallorca Teneriffa Madeira Porto Sevilla Nizza Gardasee
Bergen Tromsø Helsinki Tallinn Riga Vilnius Danzig Breslau Ljubljana Triest Bologna Neapel Palermo Catania Sardinien Korsika Marseille Lyon Bordeaux Biarritz
Bilbao Madrid Valencia Granada Málaga Gran-Canaria Lanzarote Fuerteventura Ibiza Menorca Algarve Azoren Malta Zypern Rhodos Korfu Thessaloniki Istanbul Antalya Kappadokien
Sylt Rügen Usedom Hamburg Berlin Dresden Leipzig München Bodensee Schwarzwald Allgäu Zugspitze Salzburg Innsbruck Zürich Luzern Zermatt Genf Brügge Gent
Luxemburg Cornwall Cotswolds Isle-of-Skye Lofoten Lappland Färöer Bretagne Normandie Provence`.split(/\s+/).map(s => s.replace(/-/g, ' '));
async function deflate(str){const s=new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'));return new Uint8Array(await new Response(s).arrayBuffer());}
const BASE = 'https://example.github.io/elo-duell/#r=';
function render(qr, px, quiet, noise){const n=qr.getModuleCount(),size=(n+2*quiet)*px,data=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.floor(y/px)-quiet,c=Math.floor(x/px)-quiet;const dark=r>=0&&c>=0&&r<n&&c<n&&qr.isDark(r,c);
 let v=dark?40:220; v=Math.max(0,Math.min(255,v+(Math.random()-0.5)*noise));const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}return{data,size};}
(async()=>{
 console.log('n | roh | deflate | b64url | URL | QR M | QR L | jsQR M 4px rein / 3px+Rauschen80 (10 Versuche)');
 for (const n of [10,20,30,50,75,100]) {
  const o = N.slice(0,n).map(name => [name, 1500 + Math.round((Math.random()-0.5)*500), Math.floor(Math.random()*30)]);
  const l = ['1','Urlaubsziele 2027','Anna',...o.map(x=>x.join('\t'))].join('\n');
  const z = await deflate(l), enc = Buffer.from(z).toString('base64url'), url = BASE+enc;
  const v = {}; let qrM;
  for (const ec of ['M','L']) { const q=qrcode(0,ec); q.addData(url,'Byte'); q.make(); v[ec]=(q.getModuleCount()-17)/4; if(ec==='M') qrM=q; }
  let clean = jsQR(...(r=>[r.data,r.size,r.size])(render(qrM,4,4,0)))?.data===url, noisy=0;
  for (let t=0;t<10;t++){const r=render(qrM,3,4,80); if(jsQR(r.data,r.size,r.size)?.data===url) noisy++;}
  console.log(`${n} | ${Buffer.byteLength(l)} | ${z.length} | ${enc.length} | ${url.length} | v${v.M} | v${v.L} | ${clean?'OK':'FAIL'} / ${noisy}/10`);
 }
 // Index-Variante (gleiche Liste bekannt): nur Elo+Duelle
 const o = N.slice(0,100).map(()=>[1500+Math.round((Math.random()-0.5)*500),Math.floor(Math.random()*30)]);
 const z = await deflate(o.map(x=>x.join(',')).join(';')); console.log('Index-Variante 100 Optionen (ohne Namen): deflate', z.length, 'b64url', Buffer.from(z).toString('base64url').length);
 const bin = new Uint8Array(100*3); o.forEach(([e,d],i)=>{bin[i*3]=e>>8;bin[i*3+1]=e&255;bin[i*3+2]=d;}); console.log('Binär 3 B/Option:', bin.length, 'b64url', Buffer.from(bin).toString('base64url').length);
})();
