// Actual Axios clients against the loopback-only, disposable in-memory fixture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

// Axios errors contain credentials and request headers; emit only safe context.
process.on('uncaughtException',error=>{
  console.error(`FAIL: ${error.name}; status=${error.response?.status ?? 'none'}; ${error.config?.url ?? 'assertion'}`);
  if(!error.isAxiosError)console.error(error.stack);
  process.exit(1);
});

const baseURL='http://127.0.0.1:8012';
await axios.get(`${baseURL}/__test/simulation-summary`); // Require fixture before writes.
const webStorage=new Map(),mobileStorage=new Map();
const loadClient=async(folder,names)=>{
  const source=await readFile(new URL(`../../${folder}/src/utils/api.js`,import.meta.url),'utf8');
  const body=source.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')
    .replace('import.meta.env.VITE_API_URL',JSON.stringify(baseURL));
  return new Function('axios','AsyncStorage','getApiBaseUrl','localStorage','window',`${body}\nreturn {${names.join(',')}};`)(
    axios,{getItem:async key=>mobileStorage.get(key)??null},()=>baseURL,
    {getItem:key=>webStorage.get(key)??null},{location:{origin:baseURL}},
  );
};
const web=await loadClient('frontend-web',['registerProvider','loginProvider','getProviderMe','getPatients','addPatient','updatePatientDetails','getPatientReadings','startSimulation','advanceSimulation','getSimulation','deleteReading','changeProviderPassword','subscribeSessionExpiry']);
const mobile=await loadClient('frontend-mobile',['loginPatient','getPatientMe','updatePatientProfile','getMyReadings','getMyLatestReading','changePatientPassword','getPatientReadings','subscribeSessionExpiry']);
const suffix=randomUUID(),password='Software-Only-Password',newPassword='Software-Only-New-Password';
const email=`provider-${suffix}@example.com`,patientEmail=`patient-${suffix}@example.com`;
const credentials={email,password};
const provider=(await web.registerProvider({...credentials,full_name:'API Test Provider'})).data;
webStorage.set('token',provider.access_token);
assert.equal((await web.getProviderMe()).data.id,provider.user.id);
const created=(await web.addPatient({email:patientEmail,password,full_name:'API Test Patient',age:30,gender:'Other'})).data;
const patientId=created.id;
await web.updatePatientDetails(patientId,{full_name:'Edited API Patient',contact:'Test contact',age:30,gender:'Other'});
const patient=(await mobile.loginPatient({email:patientEmail,password})).data;
mobileStorage.set('token',patient.access_token);
assert.equal((await mobile.getPatientMe()).data.full_name,'Edited API Patient');
await mobile.updatePatientProfile({full_name:'Edited API Patient',contact:'Updated by patient'});
assert.equal((await web.getPatients()).data.find(p=>p.id===patientId).contact,'Updated by patient');
const rejectsStatus=async(promise,status)=>assert.rejects(promise,error=>error.response?.status===status);
await rejectsStatus(web.getPatientReadings(1),404);
await rejectsStatus(mobile.getPatientReadings(patientId),403);
await rejectsStatus(mobile.getMyLatestReading(),404);
assert.deepEqual((await mobile.getMyReadings()).data,[]);
const sessionId=randomUUID().replaceAll('-','');
let run=(await web.startSimulation({patient_id:patientId,session_id:sessionId,stage_seconds:0.5})).data;
for(let attempt=0;run.stage!=='completed'&&attempt<40;attempt++){
  await new Promise(resolve=>setTimeout(resolve,550));
  run=(await web.advanceSimulation(sessionId)).data;
  assert.ok(!['failed','cancelled','timed_out','replaced'].includes(run.stage));
}
assert.equal(run.stage,'completed');
const reading=run.reading;
assert.equal(reading.patient_id,patientId);assert.equal(reading.medical_personnel_id,provider.user.id);
assert.equal(reading.is_simulated,true);assert.equal(reading.estimation_reason,'simulated_data');
for(const field of ['predicted_bgl','acetone_ppm','diabetes_level'])assert.equal(reading[field],null);
assert.equal(reading.preprocessing_metadata.is_simulated,true);
assert.deepEqual((await mobile.getMyLatestReading()).data,reading);
assert.deepEqual((await web.getPatientReadings(patientId)).data,(await mobile.getMyReadings()).data);
await web.advanceSimulation(sessionId);await web.advanceSimulation(sessionId);
assert.equal((await mobile.getMyReadings()).data.length,1);
try {
  await axios.post(`${baseURL}/__test/unavailable?enabled=true`);
  await rejectsStatus(mobile.getMyReadings(),503);await rejectsStatus(web.getPatients(),503);
} finally { await axios.post(`${baseURL}/__test/unavailable?enabled=false`); }
assert.equal((await mobile.getMyReadings()).data.length,1);
await web.deleteReading(reading.id);
assert.deepEqual((await mobile.getMyReadings()).data,[]);await rejectsStatus(mobile.getMyLatestReading(),404);
const deletedRun=(await web.advanceSimulation(sessionId)).data;
assert.equal(deletedRun.stage,'completed');assert.equal(deletedRun.reading,null); // Retained receipt, no re-creation.
assert.deepEqual((await web.getPatientReadings(patientId)).data,[]);
let mobileExpired=0,webExpired=0;
mobile.subscribeSessionExpiry(()=>mobileExpired++);web.subscribeSessionExpiry(()=>webExpired++);
await mobile.changePatientPassword({current_password:password,new_password:newPassword});
await rejectsStatus(mobile.getPatientMe(),401);assert.equal(mobileExpired,1);
await rejectsStatus(mobile.loginPatient({email:patientEmail,password}),401);
mobileStorage.set('token',(await mobile.loginPatient({email:patientEmail,password:newPassword})).data.access_token);
assert.equal((await mobile.getPatientMe()).data.id,patientId);
await web.changeProviderPassword({current_password:password,new_password:newPassword});
await rejectsStatus(web.getProviderMe(),401);assert.equal(webExpired,1);
webStorage.set('token',(await web.loginProvider({email,password:newPassword})).data.access_token);
assert.equal((await web.getProviderMe()).data.id,provider.user.id);
webStorage.clear();mobileStorage.clear();
await rejectsStatus(web.getProviderMe(),401);await rejectsStatus(mobile.getPatientMe(),401);
console.log('PASS: actual web/mobile API clients: profile synchronization, ownership, complete simulation, exactly-once persistence, error recovery, deletion, credential invalidation and unauthenticated access.');
