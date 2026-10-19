import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const importUtility=async (folder,name)=>{
  const source=await readFile(new URL(`../../${folder}/src/utils/${name}.js`,import.meta.url),'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
for (const folder of ['frontend-web','frontend-mobile']) {
  const {pageWithinRange}=await importUtility(folder,'pagination');
  const {apiErrorMessage}=await importUtility(folder,'errors');
  test(`${folder}: history pagination follows deletions and empty results`,()=>{
    assert.equal(pageWithinRange(5,16,15),2);
    assert.equal(pageWithinRange(2,1,15),1);
    assert.equal(pageWithinRange(9,0,15),1);
    assert.equal(pageWithinRange(1,31,15),1);
  });
  test(`${folder}: login, expired session, offline, validation and storage errors are distinct`,()=>{
    assert.equal(apiErrorMessage({response:{status:401},config:{url:'/auth/patient/login'}}),'Invalid email or password.');
    assert.match(apiErrorMessage({response:{status:401},config:{url:'/readings/my'}}),/session expired/);
    assert.match(apiErrorMessage({}),/Cannot reach the server/);
    assert.match(apiErrorMessage({response:{status:403}}),/permission/);
    assert.equal(apiErrorMessage({response:{status:422,data:{detail:[{msg:'Invalid input'}]}}}),'Invalid input');
    assert.equal(apiErrorMessage({response:{status:503,data:{detail:'Storage unavailable'}}}),'Storage unavailable');
  });
}

// Execute the actual mobile data hook with controlled platform lifecycle and
// transport adapters. This verifies asynchronous behaviour, not a phone UI.
const source=await readFile(new URL('../../frontend-mobile/src/hooks/usePatientReadings.js',import.meta.url),'utf8');
const hookBody=source.replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function mountHook(fetchReadings) {
  const state=[],refs=[],cleanups=[];
  let stateIndex=0,refIndex=0,focus,appChange,profileRefreshes=0;
  const useState=initial=>{
    const index=stateIndex++;state[index]=initial;
    return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];
  };
  const useRef=initial=>{const index=refIndex++;refs[index]={current:initial};return refs[index];};
  const hook=new Function('useState','useRef','useCallback','useEffect','useFocusEffect','AppState','getMyReadings','apiErrorMessage','useAuth',`${hookBody}\nreturn usePatientReadings;`)(
    useState,useRef,callback=>callback,effect=>cleanups.push(effect()),callback=>{focus=callback},
    {addEventListener:(_event,callback)=>{appChange=callback;return {remove:()=>{appChange=null}};}},
    fetchReadings,()=> 'Offline test failure',()=>({refreshProfile:async()=>{profileRefreshes++;}}),
  );
  const result=hook();
  return {state,result,focus:()=>focus(),foreground:()=>appChange('active'),
          profileRefreshes:()=>profileRefreshes,unmount:()=>cleanups.forEach(cleanup=>cleanup?.())};
}
test('mobile data hook refreshes readings/profile on focus and foreground',async()=>{
  let calls=0;
  const mounted=mountHook(async()=>({data:[{id:++calls,is_simulated:true,predicted_bgl:null}]}));
  const blur=mounted.focus();await settle();
  assert.equal(mounted.state[0][0].id,1);assert.equal(mounted.profileRefreshes(),1);
  mounted.foreground();await settle();assert.equal(mounted.state[0][0].id,2);
  blur();mounted.foreground();await settle();assert.equal(calls,2);
  const blurAgain=mounted.focus();await settle();assert.equal(mounted.state[0][0].id,3);
  blurAgain();mounted.unmount();
});
test('mobile data hook ignores stale responses and responses after leaving the screen',async()=>{
  const first=deferred(),second=deferred();let calls=0;
  const mounted=mountHook(()=>++calls===1?first.promise:second.promise);
  const blur=mounted.focus();mounted.result.refresh();
  second.resolve({data:[{id:2}]});await settle();first.resolve({data:[{id:1}]});await settle();
  assert.equal(mounted.state[0][0].id,2);
  blur();mounted.unmount();
  const late=deferred();const leaving=mountHook(()=>late.promise);const leave=leaving.focus();leave();
  late.resolve({data:[{id:99}]});await settle();assert.deepEqual(leaving.state[0],[]);leaving.unmount();
});
test('mobile data hook distinguishes failure from empty history and recovers on retry',async()=>{
  let fail=true;
  const mounted=mountHook(async()=>{if(fail)throw new Error('Synthetic offline');return {data:[]};});
  const blur=mounted.focus();await settle();assert.equal(mounted.state[3],'Offline test failure');
  fail=false;await mounted.result.load();assert.equal(mounted.state[3],'');assert.deepEqual(mounted.state[0],[]);
  blur();mounted.unmount();
});

const providerSource=await readFile(new URL('../src/hooks/useProviderData.js',import.meta.url),'utf8');
function mountProvider(fetchData) {
  const state=[],listeners=new Map(),cleanups=[];let index=0;
  const target=name=>({addEventListener:(event,callback)=>listeners.set(`${name}:${event}`,callback),
    removeEventListener:event=>listeners.delete(`${name}:${event}`)});
  const document={...target('document'),visibilityState:'visible'};
  const hook=new Function('useState','useRef','useCallback','useEffect','getPatients','getAllReadings','apiErrorMessage','window','document',
    providerSource.replace(/^import .*;\r?\n/gm,'').replace('export default function','function')+'\nreturn useProviderData;')(
    initial=>{const slot=index++;state[slot]=initial;return [initial,value=>{state[slot]=value}];},
    initial=>({current:initial}),callback=>callback,effect=>cleanups.push(effect()),
    fetchData,async()=>({data:[]}),()=> 'Fixture unavailable',target('window'),document,
  );
  const result=hook();return {state,result,document,fire:key=>listeners.get(key)?.(),
    unmount:()=>cleanups.forEach(cleanup=>cleanup?.()),listeners};
}
test('web hook refreshes on visible focus/visibility and removes listeners',async()=>{
  let calls=0;const mounted=mountProvider(async()=>({data:[{id:++calls}]}));await settle();
  assert.equal(calls,1);mounted.fire('window:focus');await settle();assert.equal(calls,2);
  mounted.document.visibilityState='hidden';mounted.fire('document:visibilitychange');await settle();assert.equal(calls,2);
  mounted.document.visibilityState='visible';mounted.fire('document:visibilitychange');await settle();assert.equal(calls,3);
  assert.equal(mounted.state[0].patients[0].id,3);mounted.unmount();assert.equal(mounted.listeners.size,0);
});
test('web hook retains data on failure and recovers; stale replies cannot overwrite',async()=>{
  let fail=false;const stale=deferred();let calls=0;
  const mounted=mountProvider(async()=>{calls++;if(fail)throw new Error('offline');if(calls===2)return stale.promise;return {data:[{id:calls}]};});
  await settle();mounted.fire('window:focus');mounted.fire('window:focus');await settle();
  stale.resolve({data:[{id:2}]});await settle();assert.equal(mounted.state[0].patients[0].id,3);
  fail=true;await mounted.result.load();assert.equal(mounted.state[2],'Fixture unavailable');assert.equal(mounted.state[0].patients[0].id,3);
  fail=false;await mounted.result.load();assert.equal(mounted.state[2],'');mounted.unmount();
});
for (const [folder,file,api] of [
  ['frontend-web','pages/medical/Account.jsx','changeProviderPassword'],
  ['frontend-mobile','screens/patient/AccountScreen.js','changePatientPassword'],
]) {
  const account=await readFile(new URL(`../../${folder}/src/${file}`,import.meta.url),'utf8');
  const handler=account.slice(account.indexOf('  const submit ='),account.indexOf(folder==='frontend-web'?'  const input =':'  return <ScrollView'));
  test(`${folder}: password handler signs out only after successful password change`,async()=>{
    const events=[];let fail=false;
    const submit=new Function(api,'logout','setBusy','setError','setMessage','setPassword','setAuthNotice','Alert','apiErrorMessage','password','profile','updateProfile',
      handler+'\nreturn submit;')(
      async()=>{events.push('change');if(fail)throw new Error('rejected');},async()=>events.push('logout'),
      ()=>{},()=>{},()=>{},()=>{},()=>events.push('notice'),{alert:()=>events.push('notice')},()=> 'Rejected',{}, {},async()=>{},
    );
    const invoke=()=>folder==='frontend-web'?submit({preventDefault(){}},'password'):submit('password');
    await invoke();assert.ok(events.indexOf('logout')>events.indexOf('change'));assert.ok(events.includes('notice'));
    events.length=0;fail=true;await invoke();assert.deepEqual(events,['change']);
  });
}

const mobileAuthSource=await readFile(new URL('../../frontend-mobile/src/context/AuthContext.js',import.meta.url),'utf8');
function mountMobileAuth(fetchProfile,saveProfile=async data=>({data})) {
  const state=[],storage=new Map(),cleanups=[];let index=0;
  const start=mobileAuthSource.indexOf('export function AuthProvider');
  const body=mobileAuthSource.slice(start,mobileAuthSource.lastIndexOf('  return (')).replace('export function','function')+
    'return {login,logout,refreshProfile,updateProfile,retry:restore};}\nreturn AuthProvider;';
  const provider=new Function('useState','useRef','useCallback','useEffect','AsyncStorage','getPatientMe','updatePatientProfile','loginPatient','subscribeSessionExpiry','apiErrorMessage',body)(
    initial=>{const slot=index++;state[slot]=initial;return [initial,value=>{state[slot]=value}];},
    initial=>({current:initial}),callback=>callback,effect=>cleanups.push(effect()),
    {getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>storage.set(key,value),multiRemove:async keys=>keys.forEach(key=>storage.delete(key))},
    fetchProfile,saveProfile,async()=>({data:{role:'patient',access_token:'synthetic-token',user:{id:1}}}),()=>()=>{},()=> 'Offline fixture',
  );
  return {result:provider({}),state,storage,unmount:()=>cleanups.forEach(cleanup=>cleanup?.())};
}
test('mobile auth profile refresh cannot overwrite a later edit or sign-out',async()=>{
  const stale=deferred();let calls=0;
  const mounted=mountMobileAuth(()=>++calls===1?stale.promise:Promise.resolve({data:{id:1,full_name:'fresh'}}));
  await settle();await mounted.result.login('synthetic','synthetic');
  const refresh=mounted.result.refreshProfile();await settle();
  await mounted.result.updateProfile({id:1,full_name:'edited'});
  stale.resolve({data:{id:1,full_name:'old'}});await refresh;
  assert.equal(mounted.state[0].full_name,'edited');
  const pending=deferred();const leaving=mountMobileAuth(()=>pending.promise);await settle();await leaving.result.login('synthetic','synthetic');
  const late=leaving.result.refreshProfile();await settle();await leaving.result.logout();pending.resolve({data:{id:1}});await late;
  assert.equal(leaving.state[0],null);assert.equal(leaving.storage.has('token'),false);
  mounted.unmount();leaving.unmount();
});
test('mobile auth restore preserves credentials on service failure and recovers',async()=>{
  let unavailable=true;const mounted=mountMobileAuth(async()=>{if(unavailable)throw new Error('Offline');return {data:{id:1,full_name:'restored'}};});
  await settle();await mounted.result.login('synthetic','synthetic');await mounted.result.retry();
  assert.equal(mounted.storage.get('token'),'synthetic-token');assert.equal(mounted.state[3],'Offline fixture');
  unavailable=false;await mounted.result.retry();assert.equal(mounted.state[0].full_name,'restored');assert.equal(mounted.state[3],'');mounted.unmount();
});
