(() => {
  'use strict';
  const root = document.getElementById('skydex-current-greenhouse-mod');
  const q = selector => root.querySelector(selector);
  const shell = q('.sdm-shell');
  const drawer = q('.sdm-drawer');
  const arrow = q('.sdm-loadout-toggle');
  const dataMenu = q('.sdm-data-menu');
  const dataToggle = q('.sdm-data-toggle');
  const field = q('.sdm-share-field');
  const input = q('.sdm-share-field input');
  const helper = q('.sdm-helper input');
  const copy = q('.sdm-export-button');
  const live = q('.sdm-live');
  let bridge, state, layoutKey, loadoutKey, sectionKey, pendingImport;
  let importRevision = 0;
  let busy = false;
  let actions = Promise.resolve();
  input.value = '';
  input.maxLength = 262144;
  input.placeholder = 'Paste a Skydex Greenhouse share code or link';
  field.classList.remove('is-imported');
  dataMenu.replaceChildren();

  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  function image(item) {
    if (!item.crop || !/^[a-z0-9_]+$/.test(item.crop)) return text('span', '?');
    const img = document.createElement('img');
    img.src = `../greenhouse/crops/${item.crop}.png`;
    img.alt = '';
    img.addEventListener('error', () => img.replaceWith(text('span', '?')), {once:true});
    return img;
  }
  function itemNode(item) {
    const node = text('span', '', 'sdm-item');
    const label = text('span', '');
    label.append(text('strong', item.name), text('small', `×${item.qty}`));
    node.append(image(item), label);
    node.title = `${item.name} ×${item.qty}`;
    return node;
  }
  function cells(placements, miniature = false) {
    const map = new Map(placements.map(p => [p.index, p]));
    const nodes = [];
    for (let i=0; i<100; i++) {
      const cell = text(miniature ? 'i' : 'span', '', miniature ? '' : 'sdm-cell');
      const item = map.get(i);
      if (item) {
        cell.className = miniature ? 'is-planted' : `sdm-cell is-planned is-${item.state}`;
        cell.append(image(item));
        cell.title = item.name;
      }
      nodes.push(cell);
    }
    return nodes;
  }
  function setDrawer(open) {
    shell.classList.toggle('is-loadouts-open', open);
    arrow.setAttribute('aria-expanded', String(open));
    arrow.setAttribute('aria-label', open ? 'Close loadouts' : 'Open loadouts');
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.inert = !open;
  }
  function setDataMenu(open) {
    dataMenu.hidden = !open;
    dataToggle.setAttribute('aria-expanded', String(open));
  }
  function render(next) {
    state = next;
    q('.sdm-version').textContent = next.version;
    q('.sdm-connection span').textContent = next.connection.toUpperCase();
    q('.sdm-connection').classList.toggle('is-disconnected', !next.connected);
    q('.sdm-connection').setAttribute('aria-label', next.connected ? `Connected to ${next.connection}` : 'Waiting for Skydex');
    helper.checked = next.helper;
    helper.disabled = !next.hasLayout;
    const layout = next.layout;
    const key = JSON.stringify(layout);
    if (key !== layoutKey) {
      layoutKey = key;
      q('.sdm-plot-name').textContent = layout.name;
      q('.sdm-plot-name').title = layout.name;
      q('.sdm-progress').textContent = layout.progress;
      q('[data-current-goal]').textContent = layout.goal;
      q('[data-current-goal]').title = layout.goal;
      const detail = q('.sdm-current-lead small');
      const count = text('b', next.hasLayout ? `${layout.cells} cells` : '');
      count.dataset.cellCount = '';
      detail.replaceChildren(count, document.createTextNode(next.hasLayout ? ' · saved on this device' : ''));
      q('.sdm-brief-head span').textContent = layout.targetLabel;
      q('[data-target-count]').textContent = layout.targets.reduce((n,i)=>n+i.qty,0);
      q('[data-input-count]').textContent = layout.inputs.reduce((n,i)=>n+i.qty,0);
      q('[data-targets]').replaceChildren(...layout.targets.map(itemNode));
      q('[data-inputs]').replaceChildren(...layout.inputs.map(itemNode));
      q('.sdm-board').replaceChildren(...cells(layout.placements));
      q('.sdm-board').setAttribute('aria-label', `${layout.name}, 10 by 10 greenhouse plot`);
      const row = q('[data-replacement]');
      row.hidden = !layout.replacement;
      if (layout.replacement) {
        const r = layout.replacement;
        row.replaceChildren(text('b','Replace'), image(r.from), text('strong',r.from.name), text('span','→'), image(r.to), text('strong',r.to.name));
      }
    }
    const savedKey = JSON.stringify(next.loadouts);
    if (savedKey !== loadoutKey) {
      loadoutKey = savedKey;
      q('.sdm-drawer-head span').textContent = `${next.loadouts.length} saved`;
      q('[data-loadout-list]').replaceChildren(...next.loadouts.map(saved => {
        const button = text('button','', 'sdm-loadout-row');
        button.type = 'button';
        button.dataset.layoutId = saved.id;
        const miniature = text('span','', 'sdm-mini-board');
        miniature.setAttribute('aria-hidden','true');
        miniature.style.gridTemplateColumns = 'repeat(10, 1fr)';
        miniature.style.gridTemplateRows = 'repeat(10, 1fr)';
        miniature.replaceChildren(...cells(saved.placements, true));
        const label = text('span','', 'sdm-loadout-copy');
        label.append(text('strong',saved.name), text('small',saved.goal.replace(/^(Grow|Plant) /,'')));
        button.append(miniature,label);
        button.addEventListener('click',()=>mutate({kind:'select',id:saved.id}));
        return button;
      }));
    }
    root.querySelectorAll('.sdm-loadout-row').forEach(b=>b.classList.toggle('is-active',b.dataset.layoutId===layout.id));
    const optionsKey = JSON.stringify(next.sections);
    if (optionsKey !== sectionKey) {
      sectionKey = optionsKey;
      if (!dataMenu.children.length) {
        for (const section of next.sections) {
          const label = text('label','');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.dataset.section = section.id;
          checkbox.addEventListener('change',()=>mutate({kind:'section',id:section.id,enabled:checkbox.checked}));
          label.append(checkbox,document.createTextNode(section.label));
          dataMenu.append(label);
        }
      }
      for (const section of next.sections) dataMenu.querySelector(`[data-section="${section.id}"]`).checked = section.enabled;
      q('[data-data-count]').textContent = next.sections.filter(s=>s.enabled).length;
    }
    root.classList.add('is-ready');
  }
  function mutate(action) {
    actions = actions.then(() => perform(action));
    return actions;
  }
  async function perform(action) {
    if (!bridge) return;
    busy = true;
    try {
      render(await bridge.request('skydex:action',action));
      if (action.kind === 'export') {
        copy.textContent = 'Copied';
        setTimeout(()=>copy.textContent='Copy export code',1100);
      }
    } catch (error) {
      live.textContent = error.message;
      if (action.kind==='export') {
        copy.textContent='Nothing to copy';
        copy.title=error.message;
        setTimeout(()=>copy.textContent='Copy export code',1600);
      }
      if (state) render(state);
    } finally { busy = false; }
  }
  arrow.addEventListener('click',()=>setDrawer(arrow.getAttribute('aria-expanded')!=='true'));
  dataToggle.addEventListener('click',()=>setDataMenu(dataMenu.hidden));
  helper.addEventListener('change',()=>mutate({kind:'helper',enabled:helper.checked}));
  copy.addEventListener('click',()=>mutate({kind:'export'}));
  root.addEventListener('click',event=>{
    if (!dataMenu.hidden && !q('.sdm-data-picker').contains(event.target)) setDataMenu(false);
  });
  input.addEventListener('input',()=>{
    clearTimeout(pendingImport);
    const revision = ++importRevision;
    field.classList.remove('is-invalid','is-imported');
    input.removeAttribute('aria-invalid');
    input.title='';
    const value=input.value.trim();
    if (!value) return;
    pendingImport=setTimeout(async()=>{
      try {
        const next=await bridge.request('skydex:action',{kind:'import',value});
        if (revision!==importRevision) return;
        render(next);
        field.classList.add('is-imported');
      } catch(error) {
        if (revision!==importRevision) return;
        field.classList.add('is-invalid');
        input.setAttribute('aria-invalid','true');
        input.title=error.message;
        live.textContent=error.message;
      }
    },280);
  });
  function fit() {
    if (root.clientWidth>1040) {
      shell.style.removeProperty('--sdm-fit-scale');
      shell.style.removeProperty('--sdm-fit-left');
    } else {
      const scale=Math.min(1,Math.max(0.28,(root.clientWidth-24)/1012));
      shell.style.setProperty('--sdm-fit-scale',String(scale));
      shell.style.setProperty('--sdm-fit-left',`${Math.max(12,(root.clientWidth-1012*scale)/2)}px`);
    }
  }
  fit();
  new ResizeObserver(fit).observe(root);
  setDrawer(false);
  setDataMenu(false);
  async function start() {
    while (!globalThis.grapheneBridge) await new Promise(resolve=>setTimeout(resolve,50));
    bridge=globalThis.grapheneBridge;
    await bridge.ready();
    await document.fonts.ready;
    render(await bridge.request('skydex:action',{kind:'state'}));
    await bridge.emit('skydex:ready',null);
    async function refresh() {
      if (!busy) {
        try { render(await bridge.request('skydex:action',{kind:'state'})); }
        catch (error) { live.textContent=error.message; }
      }
      setTimeout(refresh,500);
    }
    setTimeout(refresh,500);
  }
  start().catch(error=>{live.textContent=error.message;});
})();
