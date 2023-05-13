# Integration Example

This is a small node application that shows how to integrate with Xprizo 

## Getting Started ##

Install the node modules by running  

	npm install


run the application using

	node start (or running serve.bat)


## Information ##

This example does the following

- Shows how to get a token that can be used to access other api functions
- Shows how to fetch all your account information
- Shows how to set the callback webhook
- Shows how to use the Messaging servce
- Shows how to use the RequestPaymentRedirect

## In your system ##

**username** is your processing profile that you will use to perform the requests
**password** is your profile password
**merchant** is the account that will received the deposits
(it is better to have 2 accounts)
The processing account is the account that is used to process the transaction
The merchant account is the account that hold the money

To use callbacks, set the approval callback to the the address where you would like to receive notifications when the payment is complete



## FAQ ##

> I do not have an account

You must first register as a user on Xprizo

> I cannot find the merchant even though I know they exists

Users (and Merchants) must have there wallets visible to the public or they must be in your friends list.
They must also have enabled their "Find by" options in preferences


> The Pay by credit card is disabled

Currently only USD and INR are supported.
You must use your either your USD or INR wallet to received funds.


 



