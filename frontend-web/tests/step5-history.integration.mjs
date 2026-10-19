// Prepare a multi-page history through real simulation APIs in the disposable fixture.
// Requires the browser-created patient; never runs against the working database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import axios from 'axios';
process.on('uncaughtException',error=>{console.error(`FAIL: ${error.name}; HTTP ${error.response?.status??'none'}`);process.exit(1);});
const baseURL='http://127.0.0.1:8012';
await axios.get(`${baseURL}/__test/simulation-summary`);
const auth=(await axios.post(`${baseURL}/auth/medical/login`,{email:'demo@example.com',password:'Test-Only-Password'})).data;
const api=axios.create({baseURL,headers:{Authorization:`Bearer ${auth.access_token}`}});
const patient=(await api.get('/patients/')).data.find(p=>p.email==='browser-patient@example.com');
assert.ok(patient,'Create the disposable browser test patient first.');
const login=(await axios.post(`${baseURL}/auth/patient/login`,{email:patient.email,password:'Test-Only-Password'})).data;
const source=await readFile(new URL('../../frontend-mobile/src/utils/api.js',import.meta.url),'utf8');
const body=source.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const mobile=new Function('axios','AsyncStorage','getApiBaseUrl',body+'\nreturn {getMyReadings,getMyLatestReading,getPatientMe};')(
 axios,{getItem:async()=>login.access_token},()=>baseURL);
assert.equal((await mobile.getPatientMe()).data.full_name,patient.full_name);
const before=(await mobile.getMyReadings()).data;
assert.ok(before.length>0,'Complete a scan in the browser first.');
assert.equal((await mobile.getMyLatestReading()).data.id,before[0].id);
for(let count=before.length;count<21;count++){
 const id=randomUUID().replaceAll('-','');
 let run=(await api.post('/readings/simulations',{patient_id:patient.id,session_id:id,stage_seconds:0.5})).data;
 for(let attempt=0;run.stage!=='completed'&&attempt<30;attempt++){
  run=(await api.post(`/readings/simulations/${id}/advance`)).data;
  if(run.stage!=='completed')await new Promise(resolve=>setTimeout(resolve,510));
 }
 assert.equal(run.stage,'completed');
 await api.post(`/readings/simulations/${id}/advance`);
}
const history=(await mobile.getMyReadings()).data;
assert.equal(history.length,21);assert.equal(new Set(history.map(r=>r.acquisition_id)).size,21);
assert.equal(new Set(history.map(r=>r.scan_session_id)).size,21);
assert.ok(history.every(r=>r.is_simulated&&r.patient_id===patient.id&&r.predicted_bgl===null&&r.acetone_ppm===null));
assert.deepEqual(history,(await api.get(`/readings/patient/${patient.id}`)).data);
console.log('PASS: browser-created patient and browser scan retrieved by actual mobile API helpers; 21 exactly-once synthetic scans ready for browser pagination/deletion testing.');
