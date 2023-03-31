# Integration Example

This is a small node application that integrates with Xprizo 

## Getting Started ##

First install the node modules by running  

	npm install


Change the following details in the system:

	Username:  <your user name>
	Password:  <your password>
	Payee: <the person that you are requesting the payment from>

You will need set set callback url to an address that is reachable by Xprizo

run the application using

	node start


## Information ##

This example does the following

- Get a token used to access other api functions
- Gets your profile to that you can use your wallet
- Sends a payment request to Xprizo and then redirects to the payment screen
- sets your callback to this app
- Waits for Payment Approval Callbacks


## FAQ ##



> I do not have an account

You must first register as a user on the system

> I cannot find the user even though I know they exists


Users must have there wallets visible to the public or they must be in your friends list.
They must also have enabled their Find by options


> The Pay by credit card is disabled

Currently on USD and INR are supported.
You must use your either your USD or INR wallet to received funds into 


 



