// Test only: real DSH, DS Bot and published dsh-im channel code, synthetic QQ transport.
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, join, basename, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
export const name = 'myagent-im-smoke'
export const inject = ['connection', 'sessionController', 'sessions', 'typertGateway']
export async function apply(ctx) {
  const home = resolve(process.env.DSH_HOME ?? '')
  if (basename(home) !== 'home' || basename(dirname(home)) !== '.dsh-test-im'
      || process.env.DEEPSEEK_BASE_URL !== 'http://127.0.0.1:8799/v1') throw new Error('Isolated mock bench required')
  const root = resolve(process.env.MYAGENT_IM_PACKAGE)
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (manifest.name !== '@xmanrui/dsh-im' || manifest.version !== '5.4.0') throw new Error('Pinned dsh-im 5.4.0 required')
  const load = path => import(pathToFileURL(join(root, path)).href)
  const [{createDsBotClient}, {createDeliveryService}, {createDeliveryAdapter}, {modernHarnessApi},
    {QqHarnessClient}, {QqStateStore}, {BotWorkspaceStore, createBotWorkspaceScope}, {QqHarnessBridge},
    {installSessionSyncCoordinator}] = await Promise.all([
      'plugin-src/host/ds-bot-client.mjs', 'plugin-src/host/delivery-service.mjs',
      'plugin-src/host/delivery-adapter.mjs', 'plugin-src/host/modern-harness-api.mjs',
      'src/channels/qq/harness-client.mjs', 'src/channels/qq/state-store.mjs',
      'src/channels/shared/bot-workspace-store.mjs', 'src/channels/qq/qq-bridge.mjs',
      'plugin-src/host/session-sync-coordinator.mjs',
    ].map(load))
  const dir = join(home, 'smoke-fixture')
  const workspace = join(dir, 'workspace')
  await mkdir(workspace, {recursive:true})
  const dsBot = createDsBotClient(ctx)
  const delivery = createDeliveryService({dsBot})
  const harness = new QqHarnessClient({apiProxy:modernHarnessApi(ctx, {deliveryService:delivery}), workspace, autostart:false})
  const state = await new QqStateStore(join(dir,'qq-state.json')).load()
  const workspaces = await new BotWorkspaceStore(join(dir,'workspaces.json'), {defaultWorkspace:workspace}).load()
  const account = 'smoke-qq'
  await workspaces.ensure(account)
  const messages = []
  const capture = (target, text, mode) => {
    const id = `synthetic-reply-${messages.length + 1}`
    messages.push({id, target, text, mode})
    return {id}
  }
  const adapter = createDeliveryAdapter({channel:'qq',workspaces,dsBot,stateFor:async()=>state,
    coreController:{sendProactiveText:async (id,target,text)=> { capture(target,text,'desktop-sync'); return {sent:true} }} })
  delivery.registerAdapter(adapter)
  installSessionSyncCoordinator(ctx,delivery)
  const scope = createBotWorkspaceScope(harness,{botId:account,workspaces,state,dsBot})
  const abort = new AbortController()
  const bridge = new QqHarnessBridge({bot:{appId:account,sendText:async(target,text)=>capture(target,text,'qq-reply')},
    ownerUserOpenid:'synthetic-owner',harness:scope.harness,state:scope.state,signal:abort.signal,replyTimeoutMs:30000})
  ctx.effect(()=>()=>{abort.abort();harness.stopManagedProcess()},'smoke cleanup')
  const status = async()=>({dsBot:await dsBot.status(), messages, binding:state.sessionFor('c2c:synthetic-owner'),
    otherBinding:state.sessionFor('c2c:ordinary'),bridge:bridge.status})
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/im-smoke',methods:['POST'],requestBody:'buffered',
    fetch:async request=>{
      try {
        const {action,...p} = await request.json()
        let value
        if(action==='status') value = await status()
        else if(action==='bind') {
          const bot = await dsBot.resolve(p.botId)
          await state.setSession('c2c:synthetic-owner', bot.sessionId)
          await delivery.bindDsBot(account,'c2c:synthetic-owner',p.botId)
          value = await status()
        } else if(action==='receive') {
          await bridge.accept({kind:'c2c',messageId:p.messageId,senderId:'synthetic-owner',content:p.text,timestamp:Date.now()})
          value = await status()
        } else if(action==='ordinary') {
          const id = p.sessionId ?? await harness.createSession()
          await state.setSession('c2c:ordinary',id)
          const answer = await harness.ask(id,p.text,{timeoutMs:30000})
          value = {id,answer}
        } else if(action==='unbind') {
          await delivery.unbindDsBot(account,'c2c:synthetic-owner'); value=await status()
        } else throw new Error('Unknown smoke action')
        return Response.json({ok:true,value})
      } catch(error) {return Response.json({ok:false,error:{message:error.message,code:error.code,stack:error.stack}})}
    }}),'smoke route')
}
