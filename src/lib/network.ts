export type Tx = {
    hash: string,
    sender: string,
    recipient: string,
    value: number,
    data: string,
    height: number,
}

export async function fetchJson(url: string, options?: object): Promise<any> {
    return await (await fetch(url, options)).json() as any;
}

let watchApiCallsWaiting = 0;
export async function watchApi(parameters: string, test = false): Promise<any> {
    watchApiCallsWaiting++;
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                const url = `https://${test ? 'test-' : ''}api.nimiqwatch.com/${parameters}`;
                const result = await fetchJson(url);
                watchApiCallsWaiting--;
                resolve(result);
            } catch (e) {
                reject(e);
            }
        }, (watchApiCallsWaiting - 1) * 200); // five requests per second
    });
}

export async function findTxBetween(
    address: string, minHeight: number, maxHeight: number, test = false,
): Promise<Tx[]> {
    const page = 50; // max size of nimiq.watch
    const voteTxs: Tx[] = [];
    for (let skip = 0; ; skip += page) {
        const txs: any[] = ((await watchApi(`account-transactions/${address}/${page}/${skip}`, test)) as any[])
            .sort((a, b) => b.block_height - a.block_height); // newest/highest first
        // if (txs.length && txs[txs.length - 1]?.block_height > maxHeight) continue; // looking for older TX
        // console.log(skip, txs.map((tx) => ({ tx, data: atob(tx.data) })));
        txs.filter((tx) => tx.block_height >= minHeight && tx.block_height <= maxHeight).forEach((tx) => voteTxs.push({
            hash: tx.hash,
            sender: tx.sender_address,
            recipient: tx.receiver_address,
            value: tx.value,
            data: atob(tx.data),
            height: tx.block_height,
        }));
        if (txs.length === 0 || txs[txs.length - 1]?.block_height < minHeight) break; // done
    }
    return voteTxs;
}
