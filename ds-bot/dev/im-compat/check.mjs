import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {basename, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
if (basename(dirname(fileURLToPath(import.meta.url))) !== '.dsh-test-im') {
 throw new Error('Copy dev/im-compat into the repository .dsh-test-im directory before running')
}
const {chromium}=createRequire(new URL('../.dsh-test-ui/package.json',import.meta.url))('playwright-core')
const login=readFileSync(new URL('web.log',import.meta.url),'utf8').match(/http:\/\/127\.0\.0\.1:3099\/\?token=[^\s]+/)?.[0]
if(!login)throw new Error('Isolated server not ready')
const browser=await chromium.launch({headless:true,channel:'msedge'})
const page=await browser.newPage()
try{
 await page.goto(login)
 const call=async(path,payload)=>{
  const r=await page.evaluate(([path,p])=>fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)}).then(r=>r.json()),[path,payload])
  assert.equal(r.ok,true,JSON.stringify(r.error))
  return r.value
 }
 const bot=(e,p={})=>call('/api/bot',{endpoint:e,payload:p})
 const im=(action,p={})=>call('/api/im-smoke',{action,...p})
 const roster=await bot('state')
 const main=roster.bots.find(b=>b.id===roster.mainBotId)??roster.bots[0]
 assert.ok(main,'Main Bot must exist')
 let status=await im('status')
 if(status.binding!==main.sessionId) status=await im('bind',{botId:main.id})
 assert.equal(status.binding,main.sessionId)
 console.log('PASS: published dsh-im resolves and binds the existing fork Bot')
 const text=`IM-INBOUND-${Date.now()}`
 const messageId=`synthetic-qq-${Date.now()}`
 status=await im('receive',{text,messageId})
 assert.ok(status.messages.some(m=>m.text.includes(text)),JSON.stringify(status))
 const count=status.messages.filter(m=>m.text.includes(text)).length
 await im('receive',{text,messageId})
 assert.equal((await im('status')).messages.filter(m=>m.text.includes(text)).length,count)
 const chat=await bot('chat',{botId:main.id})
 assert.ok(JSON.stringify(chat).includes(text),'Inbound recorded in Bot history')
 console.log('PASS: synthetic QQ -> actual DSH Bot/model -> QQ reply; duplicate is not processed again')
 const before=(await im('status')).messages.length
 const ordinary=await im('ordinary',{text:`ORDINARY-ISOLATION-${Date.now()}`})
 assert.notEqual(ordinary.id,main.sessionId)
 await page.waitForTimeout(700)
 assert.equal((await im('status')).messages.length,before,'Ordinary reply must not mirror to QQ')
 console.log('PASS: separate ordinary session replies without forwarding to the bound QQ conversation')
 await page.getByRole('button',{name:'IM机器人',exact:true}).click()
 await page.getByRole('region',{name:'IM机器人设置',exact:true}).waitFor()
 await page.getByRole('tab',{name:'QQ',exact:true}).click()
 await page.getByRole('button',{name:'生成 QQ 二维码',exact:true}).waitFor()
 await page.getByRole('button',{name:'账号菜单',exact:true}).waitFor()
 console.log('PASS: IM QQ settings open inside the original DSH navigation')
 await page.getByRole('button',{name:'大肥鱼',exact:true}).first().click()
 await page.locator('.bt-head').waitFor()
 const desktop=`DESKTOP-OUTBOUND-${Date.now()}`
 await page.locator('[data-composer-input]').fill(desktop)
 await page.locator('[data-composer-input]').press('Enter')
 await page.getByText(`收到：${desktop}`,{exact:false}).last().waitFor({timeout:30000})
 for(let i=0;i<30;i++){status=await im('status');if(status.messages.some(m=>m.mode==='desktop-sync'&&m.text.includes(`收到：${desktop}`)))break;await page.waitForTimeout(200)}
 assert.ok(status.messages.some(m=>m.mode==='desktop-sync'&&m.text.includes(`收到：${desktop}`)),JSON.stringify(status))
 assert.ok(status.messages.some(m=>m.mode==='desktop-sync'&&m.text.includes('[来自 DSH]')&&m.text.includes(desktop)))
 console.log('PASS: desktop Bot chat and answer mirror to its QQ binding')
 await page.screenshot({path:new URL('qq-bridge-verified.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')})
}finally{await browser.close()}
