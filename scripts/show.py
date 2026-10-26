# Print a compact view of an extract result: python3 scripts/show.py result.json
import json,sys
d=json.load(open(sys.argv[1]))
def show(g,k,f):
    flag='' if f.get('evidence_verified',True) else ' UNVERIFIED'
    print(f"{g}.{k}: [{f['status']}{flag}] {json.dumps(f['value'],ensure_ascii=False)[:160]} | {(f['evidence'] or '')[:120]}")
print(d["name"],"|",d["organization"],"|",d["tier"],d["country"],"| cycle:",d["cycle"]["state"])
for g in ["cycle","eligibility","research","application","logistics"]:
    for k,f in d[g].items():
        if k!="state": show(g,k,f)
show("","mentors",d["mentors"])
m=d["meta"]; print("pages:",[(p["kind"],p["ok"]) for p in m["pages_read"]],"credits:",m.get("credits_used"),"ms:",m.get("elapsed_ms"))
print("notes:",m["extraction_notes"])
