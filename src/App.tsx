import { useEffect, useState } from 'react';
import Home from './Home';
import Experience from './Experience';
import SectorPage from './SectorPage';
import FilmPage from './FilmPage';
import ResearchViewer from './ResearchViewer';
import { bySlug } from './sectors';
function route(){return location.hash.replace(/^#\/?/,'').split('/');}
export default function App(){const [parts,setParts]=useState(route);useEffect(()=>{const change=()=>{setParts(route());window.scrollTo({top:0,behavior:'instant'});};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);if(parts[0]==='experience')return <Experience key={parts[1]||'scene'} initialSlug={parts[1]}/>;if(parts[0]==='sector')return <SectorPage key={parts[1]} sector={bySlug(parts[1])}/>;if(parts[0]==='research'&&parts[1]==='factor-b')return <ResearchViewer/>;if(parts[0]==='watch')return <FilmPage key={parts[1]} sector={bySlug(parts[1])} fromStory={parts[2]==='story'}/>;return <Home/>;}
