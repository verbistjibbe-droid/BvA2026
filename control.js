const App = {
  matchId: localStorage.getItem('active-match-id') || 'main',
  state: {
    homeName:'TEAM A', awayName:'TEAM B',
    homePlayers:[], awayPlayers:[],
    homeTeamColor:'#b22222', awayTeamColor:'#dc143c',
    period:'1', lastScoreText:''
  },
  channel: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bva-sync') : null,
  key(name){ return `${name}-${this.matchId}`; },
  save(){
    localStorage.setItem(this.key('bva-match-state'), JSON.stringify(this.state));
    if(this.channel) this.channel.postMessage({type:'state', state:this.state});
  },
  load(){
    const raw = localStorage.getItem(this.key('bva-match-state'));
    if(raw) this.state = JSON.parse(raw);
  },
  setMatch(id){
    this.matchId=id;
    localStorage.setItem('active-match-id',id);
    this.load(); this.render();
  },
  render(){ /* update control UI */ },
  init(){ this.load(); this.render(); }
};
App.init();
