const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

async function fetchHtml(url, referer) {
  const res = await fetch(url, {
    headers: { 'Referer': referer || url.match(/https?:\/\/[^\/]+/)[0] + '/', 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
    redirect: 'follow'
  });
  return res.text();
}

async function translateToEnglish(text) {
  if (/^[a-zA-Z0-9\s\-!?.,&%$#@()]+$/.test(text)) return text;
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=' + encodeURIComponent(text);
    const response = await fetch(url);
    const data = await response.json();
    if (data && data[0] && data[0][0] && data[0][0][0]) return data[0][0][0];
    return text;
  } catch (e) { return text; }
}

const MANGARW_API = 'https://nyonyo.wbfyqqgzxj.workers.dev';

async function fetchMangarwBrowse() {
  try { const html = await fetchHtml('https://mangarw.com/browse', 'https://mangarw.com/'); return extractMangarwBrowseList(html); }
  catch (e) { return []; }
}
function extractMangarwBrowseList(html) {
  const results = [];
  const blockRegex = /<a href="(\/manga\/[^"]+)" title="([^"]*)">([\s\S]*?)<\/a>/gi;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const path = blockMatch[1], title = blockMatch[2].trim(), blockHtml = blockMatch[3];
    const imgMatch = blockHtml.match(/data-src="([^"]+)"/), thumb = imgMatch ? imgMatch[1] : '';
    const url = 'https://mangarw.com' + path, idMatch = path.match(/\/(\d+)$/), id = idMatch ? idMatch[1] : '';
    if (!results.some(r => r.url === url)) results.push({ title, url, thumb, id, type: 'mangarw' });
  }
  return results.slice(0, 30);
}
async function fetchMangarwChapters(mangaUrl) {
  try {
    const html = await fetchHtml(mangaUrl, 'https://mangarw.com/');
    const listMatch = html.match(/<ul id="chapter-list"[^>]*>([\s\S]*?)<\/ul>/);
    if (!listMatch) return [];
    const listHtml = listMatch[1];
    const regex = /<a href="(\/read\?id=\d+)"[^>]*title="([^"]*)"[^>]*>\s*[\s\S]*?<h4[^>]*>([^<]+)<\/h4>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
    const chapters = []; let match;
    while ((match = regex.exec(listHtml)) !== null) {
      const path = match[1], title = match[3].trim(), date = match[4].trim(), idMatch = path.match(/id=(\d+)/), id = idMatch ? idMatch[1] : '';
      if (!chapters.some(c => c.id === id)) chapters.push({ id, title, date, url: 'https://mangarw.com' + path });
    }
    return chapters;
  } catch (e) { return []; }
}
async function fetchMangarwImageUrlsById(id) {
  try {
    const apiUrl = MANGARW_API + '/read?id=' + id;
    const res = await fetch(apiUrl, { headers: { 'Referer': 'https://mangarw.com/', 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const html = await res.text();
    
    let matches = html.match(/\/_img_proxy_\/[^"'\s]+\.(webp|jpg|png|jpeg)/gi);
    if (!matches) {
      matches = html.match(/https:\/\/nyonyo\.wbfyqqgzxj\.workers\.dev\/[^"'\s]+\.(webp|jpg|png|jpeg)/gi);
    }
    if (!matches) {
      matches = html.match(/https:\/\/storage\.mangabuzz\.org\/[^"'\s]+\.(webp|jpg|png|jpeg)/gi);
    }
    if (!matches) {
      const imgTags = html.match(/<img[^>]+src="([^"]+)"/gi);
      if (imgTags) {
        matches = imgTags.map(tag => {
          const src = tag.match(/src="([^"]+)"/);
          return src ? src[1] : '';
        }).filter(Boolean);
      }
    }
    
    if (!matches) return [];
    
    return [...new Set(matches)].map(url => {
      if (url.startsWith('/_img_proxy_/')) return MANGARW_API + url;
      return url;
    });
  } catch (e) { return []; }
}
async function searchMangarw(query) {
  try { const apiUrl = MANGARW_API + '/search-ajax?keyword=' + encodeURIComponent(query); const html = await fetchHtml(apiUrl, 'https://mangarw.com/'); return extractMangarwList(html); }
  catch (e) { return []; }
}
function extractMangarwList(html) {
  const results = [];
  const regex = /<a href="(\/manga\/[^"]+)"[^>]*>\s*<div[^>]*>\s*<img src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const path = match[1], thumbRaw = match[2], title = match[3].trim(), url = 'https://mangarw.com' + path;
    const thumb = thumbRaw.startsWith('https') ? thumbRaw : 'https://mangarw.com' + thumbRaw;
    const idMatch = path.match(/\/(\d+)$/), id = idMatch ? idMatch[1] : '';
    if (!results.some(r => r.url === url)) results.push({ title, url, thumb, id, type: 'mangarw' });
  }
  return results.slice(0, 20);
}

app.get('/api/mangarw/browse', async (req, res) => { res.json({ results: await fetchMangarwBrowse() }); });
app.get('/api/mangarw/search', async (req, res) => { const enQuery = await translateToEnglish(req.query.q); res.json({ results: await searchMangarw(enQuery), translated: enQuery }); });
app.get('/api/mangarw/chapters', async (req, res) => { res.json({ chapters: await fetchMangarwChapters(req.query.url) }); });
app.get('/api/mangarw/images-by-id', async (req, res) => { res.json({ urls: await fetchMangarwImageUrlsById(req.query.id) }); });

app.listen(PORT, () => console.log('Server running on port ' + PORT));
