function initializeNavigation({el,friendsBeta,dismissSimilar,ensureFeed}){
  const pagePanels={favourites:'favouritesPage',charts:'chartsPage'}
  function selectPage(page){
    if(page!=='discover'&&!Object.hasOwn(pagePanels,page))return
    const main=el('appMain')
    if(main.dataset.page===page)return
    if(!friendsBeta&&page!=='discover'&&el('analysisDialog').open)dismissSimilar(true)
    main.dataset.page=page
    for(const button of el('navigation').querySelectorAll('button')){
      if(button.dataset.page===page)button.setAttribute('aria-current','page')
      else button.removeAttribute('aria-current')
    }
    for(const [name,id] of Object.entries(pagePanels))el(id).hidden=name!==page
    const slot=el(page==='favourites'?'favouritesFeed':'discoverFeed')
    if(el('feedPanel').parentElement!==slot)slot.append(el('feedPanel'))
    if(page==='favourites')ensureFeed()
  }
  el('navigation').onclick=event=>{
    const target=event.target.closest('button[data-page]')
    if(target)selectPage(target.dataset.page)
  }
  return selectPage
}
