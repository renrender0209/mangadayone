async function fetchMangarwImageUrlsById(id) {
  try {
    const apiUrl = MANGARW_API + '/read?id=' + id;
    const res = await fetch(apiUrl, { headers: { 'Referer': 'https://mangarw.com/', 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const html = await res.text();
    
    // デバッグ用：HTMLの最初の500文字をログに
    console.log('HTML preview:', html.substring(0, 500));
    
    // 全パターンで画像URLを探す
    let matches = html.match(/\/_img_proxy_\/[^"'\s]+\.(webp|jpg|png|jpeg)/gi);
    if (!matches) {
      matches = html.match(/https:\/\/nyonyo\.wbfyqqgzxj\.workers\.dev\/[^"'\s]+\.(webp|jpg|png|jpeg)/gi);
    }
    if (!matches) {
      matches = html.match(/https:\/\/storage\.mangabuzz\.org\/[^"'\s]+\.(webp|jpg|png|jpeg)/gi);
    }
    if (!matches) {
      matches = html.match(/<img[^>]+src="([^"]+)"/gi);
    }
    
    if (!matches) return [];
    
    // プロキシパスなら完全URLに変換
    return [...new Set(matches)].map(url => {
      if (url.startsWith('/_img_proxy_/')) return MANGARW_API + url;
      if (url.startsWith('<img')) {
        const src = url.match(/src="([^"]+)"/);
        return src ? src[1] : url;
      }
      return url;
    });
  } catch (e) { return []; }
}
