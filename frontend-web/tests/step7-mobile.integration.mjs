// Verify the browser-completed Demo Patient scan through the real mobile client.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import axios from 'axios';
process.on('uncaughtException',error=>{console.error(`FAIL: ${error.name}; HTTP ${error.response?.status??'none'}`);process.exit(1);});
const baseURL='http://127.0.0.1:8012';
const summary=(await axios.get(`${baseURL}/__test/simulation-summary`)).data;
const source=await readFile(new URL('../../frontend-mobile/src/utils/api.js',import.meta.url),'utf8');
const storage=new Map();
const mobile=new Function('axios','AsyncStorage','getApiBaseUrl',source.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')+'\nreturn {loginPatient,getMyReadings,getMyLatestReading,getPatientMe};')(
 axios,{getItem:async key=>storage.get(key)??null},()=>baseURL);
const login=(await mobile.loginPatient({email:'patient@example.com',password:'Test-Only-Password'})).data;
storage.set('token',login.access_token);
const history=(await mobile.getMyReadings()).data;
assert.ok(history.length>0,'Complete the Demo Patient browser simulation first.');
assert.deepEqual((await mobile.getMyLatestReading()).data,history[0]);
assert.equal((await mobile.getPatientMe()).data.id,1);
assert.equal(new Set(history.map(r=>r.acquisition_id)).size,history.length);
assert.equal(new Set(history.map(r=>r.scan_session_id)).size,history.length);
assert.ok(summary.correct_patient&&summary.medical_outputs_unavailable);
for(const reading of history){
 assert.equal(reading.patient_id,1);assert.equal(reading.is_simulated,true);
 assert.equal(reading.estimation_reason,'simulated_data');assert.equal(reading.preprocessing_version,'tgs-adc-v1');
 for(const field of ['acetone_ppm','predicted_bgl','diabetes_level'])assert.equal(reading[field],null);
}
console.log(`PASS: browser scan -> backend/database -> actual mobile API; ${history.length} distinct simulated record(s), correct ownership and unavailable medical outputs.`);
