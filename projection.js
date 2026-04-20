const Projection = {
  matchId: new URLSearchParams(location.search).get('match') || localStorage.getItem('active-match-id') || 'main',
  state:null,
  channel: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bva-sync') : null,
  key(name){ return `${name}-${this.matchId}`; },
  load(){
    const raw = localStorage.getItem(this.key('bva-match-state'));
    if(raw) this.state = JSON.parse(raw);
  },
  render(){
    if(!this.state) return;
    document.getElementById('projHomeName').textContent=this.state.homeName;
    document.getElementById('projAwayName').textContent=this.state.awayName;
  },
  listen(){
    if(this.channel){
      this.channel.onmessage = (e)=>{
        if(e.data.type==='state'){
          this.state=e.data.state;
          this.render();
        }
      };
    }
    window.addEventListener('storage', ()=>{ this.load(); this.render(); });
  },
  init(){ this.load(); this.render(); this.listen(); }
};
Projection.init();
