export type Tx = {
    hash: string,
    sender: string,
    recipient: string,
    value: number,
    fee: number,
    data: string,
    height: number,
}

export type Block = {
    reward: number,
    fees: number,
}

export async function fetchJson(url: string, options?: object): Promise<any> {
    return await (await fetch(url, options)).json() as any;
}

let watchApiCallsLast = performance.now();
export async function watchApi(parameters: string, test = false): Promise<any> {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                const url = `https://${test ? 'test-' : ''}api.nimiqwatch.com/${parameters}`;
                const result = await fetchJson(url);
                watchApiCallsLast--;
                console.log('Nimiq.watch API: ', parameters, ' -> result', result);
                if (result.message?.indexOf('Not allowed, rate-limited') > -1) {
                    reject(new Error('Nimiq.watch API rate-limit reached. Try again later.'));
                } else {
                    resolve(result);
                }
            } catch (e) {
                reject(e);
            }
        }, Math.min(performance.now() - watchApiCallsLast, 10)); // 100 requests per second, avoid rate limit
        watchApiCallsLast = performance.now();
    });
}

export async function watchApiGetAllUntil(
    parameters: string,
    testnet = false,
    stop = (results: any[], pageSize: number) => results.length < pageSize,
): Promise<any[]> {
    const page = 50; // max page size for nimiq.watch API
    const json: any[] = [];
    for (let skip = 0; ; skip += page) {
        const rows = ((await watchApi(`${parameters}/${page}/${skip}`, testnet)) as any[]);
        json.push(...rows);
        if (stop(rows, page)) break;
    }
    return json;
}

export async function findTxBetween(
    addresses: string[], minHeight: number, maxHeight: number, testnet = false,
): Promise<Tx[]> {
    // [{"timestamp":<unix timestamp>,"block_height":0,"hash":"<hex>","sender_address":"<HRA>",
    //   "receiver_address":"<HRA>","value":<luna>,"fee":<luna>,"data":"<base64 encoded>","confirmations":0}, ...]
    const txs = await Promise.all(addresses.map(async (addr) => watchApiGetAllUntil(
        `api/v1/account-transactions/${addr}`,
        testnet,
        (results, page) =>
            results.length < page || Math.min(...results.map((r) => r.block_height)) < minHeight, // done
    ))).then((txss) => txss.flat());
    return txs
        .sort((a, b) => b.block_height - a.block_height) // newest/highest first
        .filter((tx) => tx.block_height >= minHeight && tx.block_height <= maxHeight) // in voting period
        .map((tx) => ({
            hash: tx.hash,
            sender: tx.sender_address,
            recipient: tx.receiver_address,
            value: tx.value,
            fee: tx.fee,
            data: atob(tx.data),
            height: tx.block_height,
        }));
}

export async function blockRewardsSince(address: string, startHeight: number, testnet: boolean): Promise<Block[]> {
    // {"height":0,"timestamp":<unix timestamp>,"hash":"...","fees":276,"reward":<luna>},
    return (await watchApiGetAllUntil(`account-blocks/${address}`, testnet, (results, page) =>
        results.length < page || Math.min(...results.map((r) => r.height)) < startHeight, // done
    ))
        .filter((block) => block.height > startHeight)
        .map((block) => ({
            reward: block.reward,
            fees: block.fees,
        }));
}
