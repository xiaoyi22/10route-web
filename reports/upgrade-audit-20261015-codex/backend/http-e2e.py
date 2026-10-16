import json,pathlib,urllib.request,urllib.error,http.cookiejar
r=pathlib.Path(__file__).resolve().parent.parent
base="http://127.0.0.1:20138"
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
report={"base":base,"data":"isolated compiled backend + SQLite + loopback fake upstream; no real provider requests","checks":[]}
def req(path,body=None,method=None,key=None):
 headers={"Content-Type":"application/json"}
 if key:headers["Authorization"]="Bearer "+key
 q=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
 try:res=c.open(q,timeout=30)
 except urllib.error.HTTPError as e:res=e
 raw=res.read();typ=res.headers.get("Content-Type","")
 try:data=json.loads(raw)
 except Exception:data=None
 return res.status,typ,data

def check(name,ok,status=None):
 row={"check":name,"passed":bool(ok)}
 if status is not None:row["http"]=status
 report["checks"].append(row)
 print(json.dumps(row),flush=True)
 if not ok:raise AssertionError(name)

def json_ok(name,res,status=200):
 code,typ,data=res;check(name,code==status and "application/json" in typ and data is not None,code);return data

def posts():
 f=r/"rescue-reports/fake-calls.jsonl"
 return sum(1 for _ in f.open()) if f.exists() else 0
try:
 p=json.load(open(r/"rescue-reports/e2e-private.json"))["password"]
 json_ok("isolated login",req("/api/auth/login",{"password":p}))
 nodes=json_ok("read compatible nodes",req("/api/provider-nodes"))["nodes"];node=next(x for x in nodes if x.get("prefix")=="audit")
 keys=json_ok("read isolated API keys",req("/api/keys"))["keys"];key=next(x["key"] for x in keys if x.get("name")=="Audit downstream key")
 # Enable the unpublished test model so an upstream catalog entry tests the local disabled override later.
 json_ok("enable local test model",req("/api/models/custom",{"providerAlias":"audit","id":"blocked-model","enabled":True},"PUT"))
 prefs=json_ok("balance preferences",req("/api/channel-balances?preferences=1"))
 for enabled in [True,False]:
  out=json_ok("save balance toggle "+str(enabled),req("/api/channel-balances",{"channelId":node["id"],"enabled":enabled},"PATCH"))
  check("balance toggle reflected "+str(enabled),next(x for x in out["channelOptions"] if x["id"]==node["id"])["enabled"]==enabled)
 out=json_ok("read balance persistence",req("/api/channel-balances?preferences=1"))
 check("balance disabled persists",next(x for x in out["channelOptions"] if x["id"]==node["id"])["enabled"] is False)
 state={"mode":"allowlist","models":["audit/ok-model","audit/error-model"]}
 out=json_ok("save distribution",req("/api/models/distribution",state,"PUT"));check("distribution save retained",out["models"]==state["models"])
 out=json_ok("read distribution",req("/api/models/distribution"));check("management catalog includes unpublished model",any(x["id"]=="audit/blocked-model" for x in out["catalog"]))
 out=json_ok("public catalog",req("/api/v1/models",key=key));check("public catalog filters unpublished model",not any(x["id"]=="audit/blocked-model" for x in out["data"]))
 before=posts()
 for path,body in [
 ("/api/v1/chat/completions",{"model":"audit/blocked-model","messages":[{"role":"user","content":"test"}]}),
 ("/api/v1/messages",{"model":"audit/blocked-model","max_tokens":16,"messages":[{"role":"user","content":"test"}]}),
 ("/api/v1/responses",{"model":"audit/blocked-model","input":"test"}),
 ("/api/v1/images/generations",{"model":"audit/blocked-model","prompt":"test"}),
 ("/api/v1/audio/speech",{"model":"audit/blocked-model","input":"test","voice":"alloy"}),
 ("/api/v1/search",{"model":"audit/blocked-model","query":"test"}),
 ("/api/v1/videos/generations",{"model":"xai/grok-imagine-video","prompt":"test"})]:
  out=json_ok("blocked "+path,req(path,body,key=key),404);check("structured error "+path,isinstance(out,dict) and bool(out.get("error")))
 check("blocked requests produce zero upstream POST",posts()==before)
 out=json_ok("forced SSE converted to synchronous JSON",req("/api/v1/chat/completions",{"model":"audit/ok-model","stream":False,"messages":[{"role":"user","content":"test"}]},key=key))
 check("synchronous content retained",out.get("choices",[{}])[0].get("message",{}).get("content")=="AUDIT_OK")
 check("real tail usage retained",out.get("usage",{}).get("completion_tokens")==2 and out.get("usage",{}).get("prompt_tokens")==11)
 calls=[json.loads(x) for x in (r/"rescue-reports/fake-calls.jsonl").read_text().splitlines()]
 check("node force stream reaches upstream",calls[-1]["model"]=="ok-model" and calls[-1]["stream"] is True)
 out=json_ok("upstream SSE error becomes JSON 502",req("/api/v1/chat/completions",{"model":"audit/error-model","stream":False,"messages":[{"role":"user","content":"test"}]},key=key),502)
 check("upstream error code retained",out.get("error",{}).get("code")=="audit_upstream_error")
 out=json_ok("Responses tool conversation HTTP",req("/api/v1/responses",{"model":"audit/ok-model","stream":False,"input":[{"role":"user","content":"run tool"},{"role":"assistant","content":"running","tool_calls":[{"id":"audit-call","type":"function","function":{"name":"echo","arguments":"{}"}}]},{"role":"tool","tool_call_id":"audit-call","content":"ok"},{"role":"user","content":"summarize"}]},key=key))
 calls=[json.loads(x) for x in (r/"rescue-reports/fake-calls.jsonl").read_text().splitlines()]
 check("Responses tool call ID reaches Chat upstream",calls[-1].get("toolCalls")==["audit-call"])
 check("Responses tool result ID reaches Chat upstream",calls[-1].get("toolResults")==["audit-call"])
 json_ok("disable local test model",req("/api/models/custom",{"providerAlias":"audit","id":"blocked-model","enabled":False},"PUT"))
 out=json_ok("read catalog after disabling",req("/api/models/distribution"))
 check("upstream catalog cannot revive disabled model",not any(x["id"]=="audit/blocked-model" for x in out["catalog"]))
except Exception as e:
 report["error"]=type(e).__name__+": "+str(e)
finally:
 report["passed"]=bool(report["checks"]) and all(x["passed"] for x in report["checks"]) and "error" not in report
 (r/"rescue-reports/http-e2e-final.json").write_text(json.dumps(report,indent=2))
 print(json.dumps({"passed":report["passed"],"checks":len(report["checks"])}))
 if not report["passed"]:raise SystemExit(1)
