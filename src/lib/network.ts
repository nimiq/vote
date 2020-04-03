export type Tx = {
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
                const url = `https://${test ? 'test-' : ''}api.nimiq.watch/${parameters}`;
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
    const page = 100;
    const voteTxs: Tx[] = [];
    for (let skip = 0; ; skip += page) {
        // eslint-disable-next-line
        const txs: any[] = (await watchApi(`account-transactions/${address}/${page}/${skip}`, test));
        if (txs[0].block_height > maxHeight) continue;
        console.log(skip, txs.map((tx) => ({ tx, data: atob(tx.data) })));
        txs.filter((tx) => tx.block_height >= minHeight && tx.block_height <= maxHeight)
            .reverse() // newest first
            .forEach((tx) => {
                voteTxs.push({
                    sender: tx.sender_address,
                    recipient: tx.receiver_address,
                    value: tx.value,
                    data: atob(tx.data),
                    height: tx.block_height,
                });
            });
        if (txs.length < 1 || txs[0].block_height < minHeight) break; // done
    }
    return voteTxs;
}
