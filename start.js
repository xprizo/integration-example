import { createServer } from 'http';
import signalR from "@microsoft/signalr";

const port = 8080
const localhost = `http://localhost:${port}`; // this server

let hubConnection; // the connection of the messaging server

const username = 'test-processor'; // The user/profile that performs the process
const password = 'Password123!';

const merchant = 'test-merchant'; // (Payee) The merchant who will receive the funds
const name = 'a.user@email.com' // (Payor) The person making the payment (use a unique name, like their email from your system)

const apiUrl = 'https://xprizo-test.azurewebsites.net';  // Xprizo's api server
const messageServer = 'https://xprizo-messaging.azurewebsites.net/hub'; // Xprizo's messaging server that can be used for receing event messages via sockets (signalR)


// General http function to call the api server
async function getData(url = "", token = "") { return await postData(url, null, token, "GET"); }
async function putData(url = "", data = null, token = "",) { return await postData(url, data, token, "PUT"); }
async function postData(url = "", data = {}, token = "", method = "POST") {
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
        return response.data?.token;
    });
}

// Set the callback to the address that you would like to receive the notification when the payment have been made.
async function setApprovalWebhook(callbackUrl) {
    var token = await login();
    if (!token) return null;

    const url = `${apiUrl}/api/Preference/SetApprovalWebhook?url=${callbackUrl}`;
    return await putData(url, null, token).then(response => {
        if (response.status != 200) {
            console.log('Set Approval Webhook Error:', response);
            return null
        }
        return "Success";
    });
}

// this function will return your profile
async function getProfile() {
    var token = await login();
    if (!token) return null;

    const url = `${apiUrl}/api/Profile/GetFull`;
    return await getData(url, token).then(response => {
        if (response.status != 200) {
            console.log('Get Profile Error:', response);
            return null
        }
        return response.data;
    });
}

// this function will find a user wallet
async function getWalletInfo(contact, currencyCode = 'INR') {
    var token = await login();
    if (!token) return null;

    const url = `${apiUrl}/api/Wallet/Info?contact=${contact}&currencyCode=${currencyCode}`;
    return await getData(url, token).then(response => {
        if (response.status != 200) {
            console.log('Get Wallet Info Error:', response);
            return null
        }
        return response.data;
    });
}

// this function fetch the status of a transaction
async function getStatus(accountid, reference) {
    var token = await login();
    if (!token) return null;

    const url = `${apiUrl}/api/Transaction/StatusByReference/${accountid}?reference=${reference}`;
    return await getData(url, token).then(response => {
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
async function getRequestPaymentRedirect(amount = 10, currencyCode = 'INR') {
    var wallet = await getWalletInfo(merchant, currencyCode); //get payees wallet
    if (!wallet.id) {
        console.log('Request Data Error:', `Merchant wallet Not found (${merchant})`);
        return null
    }

    var token = await login();
    if (!token) return null;

    const url = `${apiUrl}/api/Merchant/RequestPaymentRedirect?returnUrl=${localhost}`; // encrypt the payment data
    const body = {
        "name": name, //user email or mobile number
        "accountId": wallet.id, // payee account - this should be an INR account
        "description": "Subscription", // description of what the payment is for
        "reference": Math.floor(Math.random() * 10000000000001).toString(), // a unique reference number
        "amount": amount, // the amount to pay
        "currencyCode": currencyCode, // the currency to display to the user (payments will still be made in INR and then converted)
    }
    return await postData(url, body, token).then(response => {
        if (response.status != 200) {
            console.log('Request Data Error:', response);
            return null
        }
        console.log("Redirect url: ", response.data.description);
        return response.data.description;
    });
}


//This will listen for a callback from Xprizo once the transaction has been approved
//To setup a callback go to settings/preferences in Xprizo and set the approval callback
async function callbackHandler(req, res) {
    var str = "";  // request payload
    req.on('data', function (chunk) { str += chunk; });
    req.on('end', function () {
        var data = JSON.parse(str);
        console.log('callback response:', data);
        if (data.transaction.id) {
            console.log(`Checking status for tx: ${data.transaction.reference}`);
            // we need to fetch the merchants wallet so that we can find the transaction
            getWalletInfo(merchant, currencyCode).then(response => {
                // now fetch the status of the transaction
                return getStatus(response.id, data.transaction.reference)
            }).then(response => {
                console.log("Response", { status: response });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: response.description }));
            }).catch(er => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: "Fail" }));
            })
        } else if (data.status) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: data.status }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: "No Data" }));
        }
    })
}

// You can use our message service to receive notifications
// To get notifications abount the status of a transaction, you can use Callbacks
// or choose to get feedback via the messaging server.
// this is a usefull option if your callback url is publically available.
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

    var token = await login();
    if (!token) return null;

    return hubConnection.start()
        .then(() => hubConnection.invoke("Register", token))
        .then(response => {
            console.log(`Connected in with ${username}`, response)
            return `Connected with ${username}`
        }).catch(ex => {
            console.log(ex)
            return ex.message;
        });
}

// server and basic routing 
const server = createServer(async (req, res) => {
    switch (req.url) {
        case '/login':
            return await login().then(response => {
                if (response === null) return res.end('Request failed');
                res.end(`user: ${username}, Token: ${response}`);
            });
        case '/profile':
            return await getProfile().then(response => {
                if (response === null) return res.end('Request failed');
                res.end(JSON.stringify(response));
            });
        case '/wallet':
            return await getWalletInfo(merchant).then(response => {
                if (response === null) return res.end('Request failed');
                res.end(JSON.stringify(response));
            });
        case '/setcallback':
            const webhook = `${localhost}/callbackHandler`
            return await setApprovalWebhook(webhook).then(response => {
                if (response === null) return res.end('Request failed');
                res.end(`Webhhook set to: ${webhook}`);
            });
        case '/requestpayment':
            return await getRequestPaymentRedirect().then(response => {
                if (response === null) return res.end('Request failed');
                return res.writeHead(302, { Location: response }).end();  // redirect to this address
            });
        case '/connect':
            return await connect().then((response) => {
                res.end(response);
            });
        case '/callbackHandler':
            return callbackHandler(req, res);
        default:
            res.end(`
            <!DOCTYPE html><body style='margin:20px;'>
              <h2>Xprizo Integration Example<h2> <br/>  

              <h2><a href="/login">/login</a></h2>Fetch a token, that can be used to access api functions<br/>
              <h2><a href="/profile">/profile</a></h2> Fetch all your account getails  <br/>
              <h2><a href="/wallet">/wallet</a></h2> Fetch the merchants wallet <br/>
              <h2><a href="/setcallback">/setcallback</a></h2> Sets your callback so that you can listen for approvals <br/>
              <h2><a href="/connect">/connect</a></h2> Connect to message setver <br/>
              <h2><a href="/requestpayment">/requestpayment</a></h2> Redirect to the Request payment screen </a></h2>  <br/>
            </body></html>`);
            break;
    }

});

server.listen(port);
console.log(`server running on port ${port}`);


