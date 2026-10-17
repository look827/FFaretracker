import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Bookmark, CalendarDays, ChevronDown, CircleDollarSign, Clock3, LogOut, Moon, Plane, Plus, RefreshCw, Search, ShieldCheck, Sun, TrendingUp, Users, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { auth, db, functions } from './firebase';
import { classifyMovement, formatINR, percentChange, validateFlightInput } from './lib/prices';

const demoFlights = [
  { id: 'demo1', departure: 'IXC', arrival: 'SHJ', date: '2026-11-12', airline: 'Example Air', price: 18450, previousPrice: 20900, stops: 0, duration: '3h 45m', updatedAt: null, source: 'DEMO — not live data' },
  { id: 'demo2', departure: 'DEL', arrival: 'DXB', date: '2026-11-21', airline: 'Sample Airways', price: 22600, previousPrice: 21900, stops: 1, duration: '5h 20m', updatedAt: null, source: 'DEMO — not live data' },
  { id: 'demo3', departure: 'BOM', arrival: 'DOH', date: '2026-12-03', airline: 'Demo Airlines', price: 19750, previousPrice: 23500, stops: 0, duration: '3h 30m', updatedAt: null, source: 'DEMO — not live data' }
];
const money = formatINR;
function dateLabel(value) { return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'; }

function Login({ onDemo }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  async function submit(e) { e.preventDefault(); setError(''); try { await signInWithEmailAndPassword(auth, email, password); } catch { setError('Sign-in failed. Check your credentials or ask the administrator to provision your account.'); } }
  return <div className="login-wrap"><div className="login-card"><div className="brand-mark"><Plane size={22}/></div><p className="eyebrow">FLIGHT INTELLIGENCE</p><h1>Know the price.<br/><span>Make the move.</span></h1><p className="muted">Sign in to view shared flight prices, trends and your personal watchlist.</p><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Your password"/></label>{error && <p className="error">{error}</p>}<button className="primary full" type="submit">Sign in <span>→</span></button></form><button className="text-button" onClick={onDemo}>Explore demo dashboard</button><p className="tiny">Demo values are illustrative, not live fares.</p></div></div>;
}
function Stat({ label, value, note, icon: Icon, tone = '' }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={'stat-icon '+tone}><Icon size={18}/></span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}
function App() {
  const [user, setUser] = useState(undefined); const [demo, setDemo] = useState(false);
  const [flights, setFlights] = useState([]); const [history, setHistory] = useState([]);
  const [watchlist, setWatchlist] = useState([]); const [dark, setDark] = useState(true);
  const [tab, setTab] = useState('overview'); const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ departure: 'IXC', arrival: 'SHJ', date: '2026-11-12', price: '', airline: '', stops: '0', duration: '' });
  const [errors, setErrors] = useState({});
  const isAdmin = Boolean(user?.admin);
  useEffect(() => onAuthStateChanged(auth, async current => {
    if (!current) { setUser(null); return; }
    const token = await current.getIdTokenResult(true);
    setUser({ ...current, admin: token.claims.admin === true });
  }), []);
  useEffect(() => {
    if (demo || !user) return;
    const unsubFlights = onSnapshot(query(collection(db, 'flights')), snap => setFlights(snap.docs.map(d=>({id:d.id,...d.data()}))), e=>setNotice(e.message));
    const unsubHistory = onSnapshot(query(collection(db, 'priceHistory')), snap => setHistory(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const unsubWatch = onSnapshot(collection(db, 'users', user.uid, 'watchlist'), snap=>setWatchlist(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return ()=>{unsubFlights();unsubHistory();unsubWatch();};
  }, [user, demo]);
  const rows = demo ? demoFlights : flights;
  const visible = useMemo(()=>rows.filter(f=>`${f.departure} ${f.arrival} ${f.airline||''}`.toLowerCase().includes(search.toLowerCase())),[rows,search]);
  const drops = rows.filter(f=>classifyMovement(f.previousPrice, f.price)==='drop');
  const avg = rows.length ? rows.reduce((s,f)=>s+Number(f.price||0),0)/rows.length : 0;
  const selected = rows[0];
  const chartData = useMemo(()=>{
    const real = history.filter(h=>!selected || h.flightId===selected.id).map(h=>({date: h.recordedAt?.toDate ? h.recordedAt.toDate().toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : dateLabel(h.date), price:Number(h.price)}));
    if (real.length) return real;
    return [{date:'Oct 12',price:21900},{date:'Oct 13',price:21100},{date:'Oct 14',price:20500},{date:'Oct 15',price:21200},{date:'Oct 16',price:19800},{date:'Oct 17',price:selected?.price||18450}];
  },[history,selected]);
  async function savePrice(e) {
    e.preventDefault(); const nextErrors=validateFlightInput(form); setErrors(nextErrors); if(Object.keys(nextErrors).length) return;
    if (demo) { setNotice('Demo mode is read-only. Sign in as the configured admin to save prices.'); return; }
    setBusy(true);
    try {
      const call=httpsCallable(functions,'adminUpdateFlightPrice');
      await call({departure:form.departure.toUpperCase(),arrival:form.arrival.toUpperCase(),date:form.date,price:Number(form.price),airline:form.airline||'Unspecified',stops:Number(form.stops),duration:form.duration||'—',currency:'INR'});
      setShowAdd(false);setNotice('Price saved. The shared dashboard will update in real time.');setForm({...form,price:''});
    } catch(err) { setNotice(err.message || 'Could not save price.'); }
    finally { setBusy(false); }
  }
  async function addWatch(flight) {
    if (demo) { setNotice('Sign in to save a personal watchlist.'); return; }
    try { await setDoc(doc(db,'users',user.uid,'watchlist',flight.id),{flightId:flight.id,departure:flight.departure,arrival:flight.arrival,date:flight.date,createdAt:serverTimestamp()}); setNotice('Added to your watchlist.'); } catch(e){setNotice(e.message);}
  }
  async function removeWatch(id) { try { await deleteDoc(doc(db,'users',user.uid,'watchlist',id)); } catch(e){setNotice(e.message);} }
  async function refreshLive() {
    if (!isAdmin) { setNotice('Only the administrator can run a live provider refresh.'); return; }
    setBusy(true);
    try { const call=httpsCallable(functions,'searchFlights'); const result=await call({departure:'IXC',arrival:'SHJ',outboundDate:'2026-11-12',currency:'INR'}); setNotice(`Provider returned ${result.data?.count ?? 0} result(s). Review and save verified fares.`); }
    catch(e){setNotice(e.message||'Live refresh failed.');} finally{setBusy(false);}
  }
  if(user===undefined && !demo) return <div className="loading"><div className="spinner"/>Loading secure dashboard…</div>;
  if(!user && !demo) return <Login onDemo={()=>setDemo(true)}/>;
  return <div className={dark?'app dark':'app light'}>
    <aside className="sidebar"><div className="logo"><div className="brand-mark"><Plane size={20}/></div><div><b>airtrack<span>.</span></b><small>PRICE INTELLIGENCE</small></div></div>
      <div className="workspace-label">WORKSPACE</div><nav>
        {[['overview','Overview',Activity],['watchlist','My watchlist',Bookmark],['alerts','Price alerts',Bell]].map(([id,label,Icon])=><button key={id} className={'nav-item '+(tab===id?'active':'')} onClick={()=>setTab(id)}><Icon size={18}/>{label}{id==='alerts'&&drops.length>0&&<i>{drops.length}</i>}</button>)}
      </nav><div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={17}/><div><b>{isAdmin?'Administrator access':'Read-only access'}</b><small>{isAdmin?'Price editing enabled':'Prices protected'}</small></div></div><button className="nav-item" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>} {dark?'Light mode':'Dark mode'}</button>{!demo&&<button className="nav-item" onClick={()=>signOut(auth)}><LogOut size={18}/>Sign out</button>}<div className="user-chip"><div className="avatar">{(user?.email||'D')[0].toUpperCase()}</div><div><b>{demo?'Demo viewer':user?.email}</b><small>{demo?'Sample data':isAdmin?'Admin':'Viewer'}</small></div><ChevronDown size={15}/></div></div>
    </aside>
    <main className="main"><header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{tab==='overview'?'Overview':tab==='watchlist'?'My watchlist':'Price alerts'}</b></div><div className="top-actions"><span className="live-status"><i/> {demo?'DEMO MODE':'LIVE SYNC'}</span><button className="icon-btn" aria-label="Toggle theme" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="avatar">{(user?.email||'D')[0].toUpperCase()}</div></div></header>
      <div className="content"><div className="page-heading"><div><p className="eyebrow">SATURDAY, OCTOBER 17, 2026</p><h1>{tab==='overview'?'Flight overview':tab==='watchlist'?'Your watchlist':'Price alerts'}<span className="heading-dot">.</span></h1><p className="muted">{tab==='overview'?'Track fares, spot movements, and act at the right moment.':'Your personal flight price workspace.'}</p></div><div className="heading-actions">{isAdmin&&<button className="secondary" onClick={refreshLive} disabled={busy}><RefreshCw size={16} className={busy?'spin':''}/> Refresh provider</button>}{isAdmin&&<button className="primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Update price</button>}</div></div>
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
      {tab==='overview'&&<><div className="stats-grid"><Stat label="Tracked routes" value={rows.length} note="Across all shared routes" icon={Plane}/><Stat label="Average listed fare" value={money(avg)} note="Current saved prices" icon={CircleDollarSign} tone="purple"/><Stat label="Price drops" value={drops.length} note="Change of 8% or more" icon={ArrowDownRight} tone="green"/><Stat label="Watchlist items" value={demo?0:watchlist.length} note="Saved to your account" icon={Bookmark} tone="orange"/></div>
      <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>Price movement</h2><p className="muted">Selected route · historical fare (INR)</p></div><button className="period-select">7 days <ChevronDown size={14}/></button></div><div className="chart-summary"><strong>{money(selected?.price||0)}</strong><span className={percentChange(selected?.previousPrice,selected?.price)<=0?'positive':'negative'}>{percentChange(selected?.previousPrice,selected?.price)<=0?<ArrowDownRight size={15}/>:<ArrowUpRight size={15}/>} {Math.abs(percentChange(selected?.previousPrice,selected?.price)||0).toFixed(1)}% vs previous</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:12,right:8,left:0,bottom:0}}><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c6cff" stopOpacity={0.32}/><stop offset="95%" stopColor="#7c6cff" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line)"/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={v=>`${Math.round(v/1000)}k`} width={38}/><Tooltip formatter={v=>money(v)} contentStyle={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:10,color:'var(--text)'}}/><Area type="monotone" dataKey="price" stroke="#8b7cff" strokeWidth={2.5} fill="url(#priceFill)" activeDot={{r:5,fill:'#8b7cff'}}/></AreaChart></ResponsiveContainer></div><div className="chart-foot"><span><i className="legend-dot"/>Fare history</span><span><Clock3 size={13}/> {demo?'Illustrative chart':'Updates as data changes'}</span></div></section>
      <section className="panel insights-panel"><div className="panel-head"><div><h2>Price insights</h2><p className="muted">Signals from your tracked fares</p></div><span className="mini-icon"><TrendingUp size={17}/></span></div><div className="insight-feature"><div className="insight-symbol"><ArrowDownRight size={20}/></div><div><b>{drops.length?`${drops.length} fare drop${drops.length>1?'s':''} detected`:'Watching for price drops'}</b><p>{drops.length?'One or more tracked fares moved down by at least 8%.':'Alerts appear when a tracked fare crosses your threshold.'}</p></div></div><div className="insight-row"><span>Lowest listed fare</span><b>{money(rows.length?Math.min(...rows.map(f=>Number(f.price))):0)}</b></div><div className="insight-row"><span>Routes monitored</span><b>{rows.length}</b></div><div className="insight-row"><span>Data freshness</span><b>{demo?'Sample data':'Live database sync'}</b></div><div className="tip-box"><Bell size={16}/><span><b>Smart tip</b><br/>Set a personal target in your watchlist to receive alerts when prices cross your preferred threshold.</span></div></section></div></>}
      {(tab==='overview'||tab==='watchlist')&&<section className="panel table-panel"><div className="panel-head table-heading"><div><h2>{tab==='watchlist'?'Saved routes':'Tracked flights'}</h2><p className="muted">{tab==='watchlist'?'Your personal saved flights':'Shared fares, visible to all signed-in users'}</p></div><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search route…"/></div></div><div className="table-scroll"><table><thead><tr><th>ROUTE</th><th>DEPARTURE</th><th>AIRLINE</th><th>STOPS</th><th>CURRENT PRICE</th><th>CHANGE</th><th></th></tr></thead><tbody>{(tab==='watchlist'?rows.filter(f=>watchlist.some(w=>w.flightId===f.id)):visible).map(f=>{const change=percentChange(f.previousPrice,f.price);return <tr key={f.id}><td><div className="route-cell"><div className="route-icon"><Plane size={15}/></div><div><b>{f.departure} <span>→</span> {f.arrival}</b><small>{f.date}</small></div></div></td><td><div className="date-cell"><CalendarDays size={14}/>{dateLabel(f.date)}</div></td><td>{f.airline||'—'}</td><td><span className="stop-pill">{Number(f.stops)===0?'Non-stop':`${f.stops} stop${f.stops===1?'':'s'}`}</span></td><td><b className="price">{money(f.price)}</b></td><td><span className={change<=0?'change-down':'change-up'}>{change===null?'—':`${change>0?'+':''}${change.toFixed(1)}%`}</span></td><td><button className="row-action" title="Add to personal watchlist" onClick={()=>addWatch(f)}><Bookmark size={16}/></button></td></tr>})}{!visible.length&&<tr><td colSpan="7" className="empty">No matching flights. {isAdmin?'Update a fare to get started.':'Ask the administrator to add a route.'}</td></tr>}</tbody></table></div><div className="table-footer"><span>Showing {tab==='watchlist'?rows.filter(f=>watchlist.some(w=>w.flightId===f.id)).length:visible.length} routes</span><span><i className="status-dot"/> {demo?'Demo data only':'Firestore synchronized'}</span></div></section>}
      {tab==='alerts'&&<section className="panel alert-panel"><div className="panel-head"><div><h2>Price movement alerts</h2><p className="muted">Significant changes across tracked routes</p></div><Bell size={19}/></div>{rows.filter(f=>classifyMovement(f.previousPrice,f.price)!=='stable').map(f=><div className="alert-row" key={f.id}><div className="alert-icon"><ArrowDownRight size={18}/></div><div className="alert-body"><b>{f.departure} → {f.arrival}</b><p>{classifyMovement(f.previousPrice,f.price)==='drop'?'Fare dropped':classifyMovement(f.previousPrice,f.price)==='surge'?'Fare increased':'Not enough data'} by {Math.abs(percentChange(f.previousPrice,f.price)||0).toFixed(1)}%</p></div><strong>{money(f.price)}</strong></div>)}{!rows.length&&<div className="empty">No price alerts yet. Alerts will appear as tracked prices change.</div>}<p className="muted alert-disclaimer">Email delivery requires configuring an email provider and verified sender in Firebase Functions secrets.</p></section>}
      <footer><span>airtrack<span className="heading-dot">.</span> <span className="muted">Flight Price Intelligence</span></span><span>Protected by Firebase Authentication & Firestore Rules</span></footer>
      </div></main>
      {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">ADMIN CONTROL</p><h2>Update flight price</h2><p className="muted">This change will be shared with all viewers.</p></div><button className="icon-btn" onClick={()=>setShowAdd(false)}><X size={18}/></button></div><form onSubmit={savePrice} className="price-form"><div className="form-grid"><label>Origin (IATA)<input maxLength="3" value={form.departure} onChange={e=>setForm({...form,departure:e.target.value.toUpperCase()})}/>{errors.departure&&<small className="error">{errors.departure}</small>}</label><label>Destination<input maxLength="3" value={form.arrival} onChange={e=>setForm({...form,arrival:e.target.value.toUpperCase()})}/>{errors.arrival&&<small className="error">{errors.arrival}</small>}</label><label>Departure date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>{errors.date&&<small className="error">{errors.date}</small>}</label><label>Current price (INR)<input type="number" min="1" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="18450"/>{errors.price&&<small className="error">{errors.price}</small>}</label><label className="wide">Airline<input value={form.airline} onChange={e=>setForm({...form,airline:e.target.value})} placeholder="Airline name"/></label><label>Stops<select value={form.stops} onChange={e=>setForm({...form,stops:e.target.value})}><option value="0">Non-stop</option><option value="1">1 stop</option><option value="2">2+ stops</option></select></label><label>Duration<input value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} placeholder="3h 45m"/></label></div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy?'Saving…':'Save price update'}</button></div><p className="tiny">Only the server-verified admin claim can write shared fare data.</p></form></div></div>}
    </div>;
}
export default App;