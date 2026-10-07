const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize, createReader } = require('../services/botPackEvents');
function response() { return { statusCode: 0, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } }; }
test('token authorization fails closed and accepts only the dedicated token', () => {
    const old = process.env.JACKHOUSE_BOT_EVENT_TOKEN;
    try {
        delete process.env.JACKHOUSE_BOT_EVENT_TOKEN;
        const disabled=response(); authorize({headers:{}}, disabled, () => assert.fail()); assert.equal(disabled.statusCode,503);
        process.env.JACKHOUSE_BOT_EVENT_TOKEN='x'.repeat(32);
        const denied=response(); authorize({headers:{authorization:'Bearer wrong'}}, denied, () => assert.fail()); assert.equal(denied.statusCode,401);
        let accepted=false; authorize({headers:{authorization:'Bearer '+'x'.repeat(32)}}, response(), () => { accepted=true; }); assert.ok(accepted);
    } finally { if (old === undefined) delete process.env.JACKHOUSE_BOT_EVENT_TOKEN; else process.env.JACKHOUSE_BOT_EVENT_TOKEN=old; }
});
function database(rows) {
    return { transaction: async (opts, fn) => { assert.equal(opts.isolationLevel,'REPEATABLE READ'); return fn({}); },
        query: async (sql, opts) => { assert.equal(opts.logging,false); return sql.includes(' AS cursor ') ? [{cursor:'3'}] : rows; } };
}
test('incremental events preserve old-pack transitions, flags, exact cursors and page boundary', async () => {
    const rows=[1,2,3].map(id=>({id:String(id),pack_id:42,old_featured:0,featured:1,old_recommended:0,recommended:id===2?1:0,snapshot:'{"pack_id":42,"title":"old pack"}'}));
    const res=response(); await createReader(database(rows))({query:{after:'0',limit:'2'}},res);
    assert.equal(res.statusCode,200); assert.equal(res.body.cursor,'2'); assert.equal(res.body.has_more,true);
    assert.equal(res.body.data[1].recommended,true); assert.equal(res.body.data[0].old_featured,false);
});
test('latest does not return historical events; invalid and reversed cursor are rejected', async () => {
    const reader=createReader(database([]));
    const latest=response(); await reader({query:{latest:'1'}},latest); assert.deepEqual(latest.body,{data:[],cursor:'3',has_more:false});
    const invalid=response(); await reader({query:{after:'0 OR 1=1'}},invalid); assert.equal(invalid.statusCode,400);
    const reset=response(); await reader({query:{after:'4'}},reset); assert.equal(reset.statusCode,409);
});
