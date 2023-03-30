import { createServer } from 'http';

const username = '<USERNAME>';
const password = '<PASSWORD>'
const payee = '<PAYEE>' // this can be a users username, email or mobile
const apiUrl = 'https://xprizo-test.azurewebsites.net';
let token = "";
let accountId = 0;
let profile = {};

async function getData(url = "") { return await postData(url, null, "GET"); }
async function putData(url = "", data = null) { return await postData(url, data, "PUT"); }
async function postData(url = "", data = {}, method = "POST") {
    try {
        var headers = { "Content-Type": "application/json" }
        if (token) headers.Authorization = `Bearer ${token}`;
        // Default options are marked with *
        var info = {
            method: method, // *GET, POST, PUT, DELETE, etc.
            mode: "cors", // no-cors, *cors, same-origin
            cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
            credentials: "same-origin", // include, *same-origin, omit
            headers: headers,
            redirect: "follow", // manual, *follow, error
            referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        }
        if (data) info.body = JSON.stringify(data);
        const response = await fetch(url, info);
        if (response.status !== 200 && response.status !== 400) return {
            status: response.status,
            data: response.statusText
        };
        var data = await response.json();
        return {
            status: response.status,
            data: data
        };
    } catch (er) {
        return { status: 501, data: er?.message };
    }
}


// this function will get a token that you can use for other requests
async function login() {
    const url = `${apiUrl}/api/Security/GetToken`;
    const body = { "userName": username, "password": password, }

    return await postData(url, body).then(response => {
        if (response.status == 200) token = response.data.token;
        return response;
    })
}

// Set the callback to the address that you would like to receive the notification when the payment have been made.
async function setApprovalWebhook(callbackUrl) {
    await login();

    const url = `${apiUrl}/api/Preference/SetApprovalWebhook?url=${callbackUrl}`;
    return await putData(url);
}

// this function will return your profile
async function getProfile() {
    await login();

    const url = `${apiUrl}/api/Profile/GetFull`;
    return await getData(url).then((response) => {
        if (response.status == 200) {
            profile = response.data;
            accountId = profile.userWallets.find(x => x.currencyCode === 'USD').id;
        }
        return response;
    });
}

// this function will find a user wallet
async function getWalletInfo(contact, currencyCode = '') {
    await login();

    const url = `${apiUrl}/api/Wallet/Info?contact=${contact}&currencyCode=${currencyCode}`;
    return await getData(url);
}

// this function fetch the status of a transaction
async function getStatus(accountid, reference) {
    const url = `${apiUrl}/api/Transaction/StatusByReference/${accountid}?reference=${reference}`;
    return await getData(url).then((response) => { return response; });
}

//This function will create the payment request that the user will approve
//When the user approves the transaction the approval callback will be triggered
async function requestPayment() {
    await login();
    await getProfile();
    var walletResponse = await getWalletInfo(payee, 'USD');
    if (walletResponse.status != 200) return walletResponse;

    const url = `${apiUrl}/api/Transaction/RequestPayment`;
    const body = {
        "description": "Subscription",
        "reference": `AAA-${Date.now().toLocaleString()}`,
        "amount": 10,
        "fromAccountId": walletResponse.data.id,
        "toAccountId": accountId
    }

    return await postData(url, body);
}

//This will listen for a callback from Xprizo once the transaction has been approved
//To setup a callback go to settings/preferences in Xprizo and set the approval callback
async function approveCallback(req, res) {
    await login();
    await getProfile();

    var str = "";
    req.on('data', function (chunk) { str += chunk; });
    req.on('end', function () {
        var data = JSON.parse(str);
        console.log(`Checking status for tx: ${data.transaction.reference}`);
        getStatus(accountId, data.transaction.reference).then(response => {
            console.log(response);
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end();
        })
    })
}


const server = createServer(async (req, res) => {
    switch (req.url) {
        case '/login':
            return await login().then(response => {
                res.writeHead(response.status, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify(response));
                res.end();
            });
        case '/profile':
            return await getProfile().then(response => {
                res.writeHead(response.status, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify(response));
                res.end();
            });
        case '/setcallback':
            return await setApprovalWebhook("http://localhost/approve").then(() => {
                res.end("Done");
            });
        case '/requestpayment':
            return await requestPayment().then(response => {
                console.log(response);
                if (response.status != 200) return res.end();
                var url = `${apiUrl}/#/payment/193/452?key=${response.data.key}`;
                var redirect = 'http://localhost:8080/';
                var url = `${apiUrl}/#/payment/${profile.id}/${accountId}?key=${response.data.key}&redirect=${redirect}`;
                return res.writeHead(302, { Location: url }).end();
            });
        case '/approve':
            return approveCallback(req, res);
        default:
            res.end(`
            <!DOCTYPE html><body style='margin:20px;'>
              <h2>Xprizo Integration Example<h2> <br/>  

              <h2><a href="/login">/login</a></h2> Used to get a token<br/>
              <h2><a href="/setcallback">/setcallback</a></h2> Sets your callback so that you can listen for approvals <br/>
              <h2><a href="/profile">/profile</a></h2> Used to get youpr profile and wallet id (accountId) <br/>
              <h2><a href="/requestpayment" >/requestpayment</a></h2> <br/>
            </body></html>`);
            break;
    }

});

server.listen(8080);

console.log('server running on port 8080');


