import { createServer } from 'http';
import signalR from "@microsoft/signalr";

const username = '<username>';
const password = '<password>'
const name = 'test@gmail.com' // the person making the payment, this can be a users username, email or mobile
const apiUrl = 'https://xprizo-test.azurewebsites.net';
const webUrl = 'https://xprizo-test.azurewebsites.net';
const messageServer = 'https://xprizo-messaging.azurewebsites.net/hub';
const localhost = `http://localhost:8080`; // this server

let token = ""; // a token create using the getToken function
let contactId = 0; //the id of the user that logged in
let accountId = 0;
let hubConnection; // the connection of the messaging server


// General http function to call the api server
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
        const isJson = response.headers.get('content-type')?.includes('application/json');
        var data = isJson ? await response.json() : null;
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
        if (response.status != 200) {
            console.log('Login Error:', response);
            return null
        }
        console.log('token', response);
        contactId = response.data.id;
        token = response.data.token;
        return response.data;
    });
}

// Set the callback to the address that you would like to receive the notification when the payment have been made.
async function setApprovalWebhook(callbackUrl) {
    if (await login() === null) return null;

    const url = `${apiUrl}/api/Preference/SetApprovalWebhook?url=${callbackUrl}`;
    return await putData(url).then(response => {
        if (response.status != 200) {
            console.log('Set Approval Webhook Error:', response);
            return null
        }
        return "Success";
    });
}

// this function will return your profile
async function getProfile() {
    if (await login() === null) return null;
    console.log(token);
    const url = `${apiUrl}/api/Profile/GetFull`;
    return await getData(url).then(response => {
        if (response.status != 200) {
            console.log('Get Profile Error:', response);
            return null
        }
        return response.data;
    });
}

// this function will find a user wallet
async function getWalletInfo(contact, currencyCode = '') {
    if (await login() === null) return null;

    const url = `${apiUrl}/api/Wallet/Info?contact=${contact}&currencyCode=${currencyCode}`;
    return await getData(url).then(response => {
        if (response.status != 200) {
            console.log('Get Wallet Info Error:', response);
            return null
        }
        return response.data;
    });
}

// this function fetch the status of a transaction
async function getStatus(accountid, reference) {
    if (await login() === null) return null;

    const url = `${apiUrl}/api/Transaction/StatusByReference/${accountid}?reference=${reference}`;
    return await getData(url).then(response => {
        if (response.status != 200) {
            console.log('Get Status Error:', response);
            return null
        }
        console.log('Get Status Response:', response.data);
        return response.data;
    });
}

//This function will create the payment request that the user will approve
//When the user approves the transaction the approval callback will be triggered
async function buildRequestPaymentRedirect() {
    if (await login() === null) return;
    var wallet = await getWalletInfo(contactId, 'INR'); //get payees wallet

    const url = `${apiUrl}/api/Merchant/RequestPaymentRedirect?returnUrl=${localhost}`; // encrypt the payment data
    const body = {
        "name": name, //user email or mobile number
        "accountId": wallet.id, // payee account - this shoult be an INR account
        "description": "Subscription", // description of what the payment is for
        "reference": Math.floor(Math.random() * 10000000000001).toString(), // a unique reference number
        "amount": 10, // the amount to pay
        "currencyCode": 'EUR', // the currency to display to the user (payments will still be made in INR and then converted)
    }
    return await postData(url, body).then(response => {
        if (response.status != 200) {
            console.log('Request Data Error:', response);
            return null
        }
        console.log(response);
        return response.data.description;
    });
}


//This will listen for a callback from Xprizo once the transaction has been approved
//To setup a callback go to settings/preferences in Xprizo and set the approval callback
async function callbackHandler(req, res) {
    var str = "";
    req.on('data', function (chunk) { str += chunk; });
    req.on('end', function () {
        var data = JSON.parse(str);
        console.log('callback response', data);

        console.log(`Checking status for tx: ${data.transaction.reference}`);
        getStatus(accountId, data.transaction.reference).then(response => {
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(response.data);
        })
    })
}

// You can use our message service to receive notifications
async function connect() {
    console.log(`connecting to hub...${messageServer} with '${username}'`);

    hubConnection = new signalR.HubConnectionBuilder().withUrl(messageServer).build();

    //Listen for new approvals
    hubConnection.on("NewApproval", data => {
        console.log('New Pending Transaction...', data);
    });
    hubConnection.on("NewTransaction", data => {
        console.log('Transaction Approved...', data);
    });

    await login();
    return hubConnection.start()
        .then(() => hubConnection.invoke("Register", token))
        .then(response => {
            console.log(`Logged in with ${username}`, response)
        }).catch(ex => console.log(ex));
}

// server and basic routing 
const server = createServer(async (req, res) => {
    switch (req.url) {
        case '/login':
            return await login().then(response => {
                if (response === null) return res.end('Request failed');
                res.end(JSON.stringify(response));
            });
        case '/profile':
            return await getProfile().then(response => {
                if (response === null) return res.end('Request failed');
                res.end(JSON.stringify(response));
            });
        case '/wallet':
            return await getWalletInfo(contactId).then(response => {
                if (response === null) return res.end('Request failed');
                res.end(JSON.stringify(response));
            });
        case '/setcallback':
            const webhook = `${localhost}/callbackHandler`
            return await setApprovalWebhook(webhook).then(response => {
                if (response === null) return res.end('Request failed');
                res.end(response);
            });
        case '/requestpayment':
            return await buildRequestPaymentRedirect().then(response => {
                if (response === null) return res.end('Request failed');
                return res.writeHead(302, { Location: response }).end();  // redirect to this address
            });
        case '/callbackHandler':
            return callbackHandler(req, res);
        case '/connect':
            return await connect().then(() => {
                res.end("Connected");
            });
        default:
            res.end(`
            <!DOCTYPE html><body style='margin:20px;'>
              <h2>Xprizo Integration Example<h2> <br/>  

              <h2><a href="/login">/login</a></h2> Used to get a token<br/>
              <h2><a href="/profile">/profile</a></h2> Used to get youpr profile and wallet id (accountId) <br/>
              <h2><a href="/wallet">/wallet</a></h2> Get default Wallet info <br/>
              <h2><a href="/setcallback">/setcallback</a></h2> Sets your callback so that you can listen for approvals <br/>
              <h2><a href="/connect">/connect</a></h2> Connect to message setver <br/>
              <h2><a href="/requestpayment" >/requestpayment</a></h2> <br/>
            </body></html>`);
            break;
    }

});

server.listen(8080);
console.log('server running on port 8080');


