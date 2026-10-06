const params = new URLSearchParams(location.search);
let language = params.get('lang') === 'en' ? 'en' : 'zh';
let configuration = { demoUrl: 'https://aytoast.github.io/scenra/studio/#/temple-courtyard' };
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
let disposeLinkPreviews;
function appUrl(edit = false) {
  const url = new URL(isLocal ? 'http://127.0.0.1:5175/temple-courtyard' : configuration.demoUrl);
  if (edit) {
    if (url.hash) url.hash = url.hash.replace(/\/$/, '') + '/edit';
    else url.pathname = url.pathname.replace(/\/$/, '') + '/edit';
  }
  return url.href;
}
function paragraphs(items) { return items.map(text => `<p>${text}</p>`).join(''); }
function figure(type, caption) {
  const t=content[language];
  return `<figure class="rehearsal-figure"><div class="visual-scene" data-visual="${type}" role="img" aria-label="${caption}"><span class="visual-loading" role="status">${t.loading}</span></div><div class="figure-toolbar"><button data-play data-pause="${t.play}" data-resume="${t.resume}" aria-pressed="false">${t.play}</button><button data-restart>${t.restart}</button>${type==='motion'?'<span data-motion-time></span><div class="take-progress"><i></i></div>':'<span data-scene-status></span>'}</div><figcaption>${caption}</figcaption></figure>`;
}
function motionStudy(t) {
  return `<figure class="rehearsal-figure motion-study"><div class="edit-direction"><span>${t.instructionLabel}</span><p>${t.editInstruction}</p><button data-apply-punch aria-pressed="false">${t.applyEdit}</button><p role="status" data-edit-status data-original="${t.editOriginal}" data-applied="${t.editApplied}" data-unavailable="${t.editUnavailable}">${t.editOriginal}</p></div><div class="visual-scene" data-visual="detail" role="img" aria-label="${t.studyCaption}"><span class="visual-loading">${t.loading}</span><span class="take-label" data-take-label>${t.baseline}</span><span class="take-label" data-take-label data-edited="${t.adjusted}" data-pending="${t.baseline}">${t.baseline}</span></div><div class="study-phases">${t.phases.map(label=>`<span data-phase>${label}</span>`).join('')}</div><label class="study-timeline">${t.firstPunch}<output data-study-clock>2.50 s</output><input type="range" data-study-time min="2.5" max="4.6" step="0.01" value="2.5" aria-label="${t.firstPunch}"></label><div class="study-inputs" hidden>${[['height',t.height,0,.12,.01,0,'+0 cm'],['windup',t.windup,0,.25,.01,.18,'+18 cm'],['duration',t.duration,.10,.30,.01,.15,'150 ms']].map(([key,label,min,max,step,value,output])=>`<label>${label}<output>${output}</output><input type="range" data-study="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`).join('')}</div><div class="figure-toolbar"><button data-play data-pause="${t.play}" data-resume="${t.resume}" aria-pressed="false">${t.play}</button><button data-restart>${t.restart}</button><button data-reset-study>${t.reset}</button></div><figcaption>${t.studyCaption}</figcaption></figure>`;
}
function spatialCapture(t) {
  return `<figure class="rehearsal-figure spatial-capture"><div class="visual-scene spatial-render" data-visual="capture" role="img" aria-label="${t.captureCaption}"><span class="visual-loading" role="status">${t.loading}</span>${t.captureViews.map(([label])=>`<span class="capture-label">${label}</span>`).join('')}</div><div class="capture-inputs"><label>${t.capturePosition}<input type="range" data-capture="position" min="0" max="1" step="0.01" value="0" aria-label="${t.capturePosition}"></label><label>${t.captureFov}<output>48°</output><input type="range" data-capture="fov" min="32" max="75" step="1" value="48" aria-label="${t.captureFov}"></label></div><div class="figure-toolbar"><button data-play data-pause="${t.play}" data-resume="${t.resume}" aria-pressed="false">${t.play}</button><button data-restart>${t.restart}</button></div><figcaption>${t.captureCaption}</figcaption></figure>`;
}
function render() {
  disposeLinkPreviews?.();
  window.ScenraVisuals?.destroy();
  const t = content[language];
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t.title;
  document.querySelector('meta[name="description"]').content = t.description;
  document.getElementById('root').innerHTML = `
    <a class="skip" href="#main">${t.skip}</a>
    <header class="document-bar"><a class="wordmark" href="#main">scenra</a><span>TRIPOTHON S1</span><button id="language-toggle" aria-label="${language === 'zh' ? 'Switch to English' : '切换到中文'}">${language === 'zh' ? 'EN' : '中文'}</button></header>
    <main id="main" class="proposal"><article>
      <div class="document-heading"><p class="document-kind">${t.kind}</p><h1>${t.heading}</h1><p class="subtitle">${t.subtitle}</p><p class="document-meta">${t.meta}</p></div>
      <section class="abstract" aria-labelledby="abstract-title"><h2 id="abstract-title">${t.abstractTitle}</h2>${paragraphs(t.abstract)}<div class="document-links"><a data-app href="${appUrl()}">${t.launch} ↗</a><a href="https://github.com/aytoast/scenra">${t.repo} ↗</a></div></section>
      <nav class="contents" aria-label="${t.contentsTitle}"><span>${t.contentsTitle}</span>${t.sections.map(([id,title]) => `<a href="#${id}">${title}</a>`).join('')}</nav>
      <section id="question"><h2>${t.sections[0][1]}</h2>${paragraphs(t.question)}</section>
      <section id="approach"><h2>${t.approachTitle}</h2>${paragraphs(t.approach)}<dl class="tool-roles">${t.tools.map(([name,role]) => `<div><dt>${name}</dt><dd>${role}</dd></div>`).join('')}</dl></section>
      <section id="controls"><h2>${t.controlsTitle}</h2><h3 id="performance-edit">${t.microTitle}</h3>${paragraphs(t.microBody)}${motionStudy(t)}<details><summary>${t.fullTake}</summary><p>${t.demoIntro}</p>${figure('motion',t.demoCaption)}</details><p class="prototype-links"><a data-app data-editor href="${appUrl(true)}">${t.editorLink} ↗</a></p><h3 id="spatial-camera">${t.spatialTitle}</h3><p>${t.spatialBody}</p>${spatialCapture(t)}<p>${t.spatialDetail}</p><p>${t.cameraResearch}</p><p class="prototype-links"><a href="https://github.com/aytoast/scenra/tree/main/app/src/modules/xr">${t.spatialLink} ↗</a></p><h3 id="physical-interaction">${t.physicsTitle}</h3>${paragraphs(t.physicsResearch)}<p>${t.physicsBody}</p><p class="prototype-links"><a data-app href="${appUrl()}">${t.physicsLink} ↗</a></p></section>
      <section id="evaluation"><h2>${t.evaluationTitle}</h2>${paragraphs(t.evaluationIntro)}<ul class="evaluation-list">${t.evaluation.map(([title,body])=>`<li><strong>${title}</strong><p>${body}</p></li>`).join('')}</ul>${paragraphs(t.evaluationEnd)}<h3>${t.evidenceTitle}</h3>${paragraphs(t.prototype)}<p>${t.workflow}</p><div class="sample-materials">${t.materialNames.map((name,i)=>`<figure><img src="assets/${['courtyard','bench','table','burner'][i]}.png" alt="${name}" loading="lazy"><figcaption>${name}</figcaption></figure>`).join('')}</div><p class="figure-note">${t.materialNote}</p></section>
      <section id="next"><h2>${t.nextTitle}</h2>${paragraphs(t.next)}<details><summary>${t.hardwareTitle}</summary>${paragraphs(t.hardware)}<figure class="hardware-figure"><img src="assets/director-video-village.png" alt="${t.photoCaption}" loading="lazy"><figcaption>${t.photoCaption}</figcaption></figure><p><a href="assets/workstation-${language}.svg" target="_blank" rel="noopener">${t.layoutLink} ↗</a></p></details></section>
      <section id="references" class="references"><h2>${t.referencesTitle}</h2><ol>${t.references.map(([name,description,url],i)=>`<li id="ref-${i+1}"><a href="${url}" target="_blank" rel="noopener">${name} ↗</a><p>${description}</p></li>`).join('')}</ol></section>
    </article></main><footer><span>Scenra / TRIPOTHON S1</span><a href="assets/ARDY-LICENSE.txt">ARDY · Apache 2.0</a></footer>`;
  document.getElementById('language-toggle').onclick = () => {
    const y = scrollY;
    language = language === 'zh' ? 'en' : 'zh';
    const url = new URL(location.href);
    url.searchParams.set('lang', language);
    history.replaceState(null, '', url);
    render();
    window.scrollTo(0, y);
  };
  disposeLinkPreviews = window.mountLinkPreviews?.(language, t);
  window.ScenraVisuals?.mountAll();
}
render();
if(location.hash)requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior:'instant'}));
fetch('./site-config.json').then(response => response.json()).then(value => {
  if (value.demoUrl && new URL(value.demoUrl).protocol === 'https:') {
    configuration = value;
    document.querySelectorAll('[data-app]').forEach(link => link.href = appUrl(link.hasAttribute('data-editor')));
  }
}).catch(() => {});
