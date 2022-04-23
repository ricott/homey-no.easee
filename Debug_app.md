# Debug the Easee app
To access the logs from an Homey Pro app you need to install the app via the Homey Command Line Interface (CLI) from a laptop. This guide intends to explain how this is done.

## Install Node
Install Node from https://nodejs.org/.

Depending on your OS there are other options, like on a Mac using brew `brew install node`

## Install Homey CLI
Using the `-g` flag will install the Homey CLI globally
```
npm install -g homey
```

## Login to Homey via CLI
```
homey login
```

## Uninstall the Easee app
If you are here you have most likely installed the Easee app previously from the Homey app store. Due to the use of an encryption key for the Easee account details you need to uninstall the Easee app before installing it via CLI.

## Download and configure the Easee app
Download the source code to the Easee app from here, https://github.com/ricott/homey-no.easee/archive/refs/heads/master.zip.

1. Unzipp all files
2. In the root folder create a file called `env.json`
3. Place the following content in the file
```
{
    "ENCRYPTION_KEY": "key"
}
```
4. Type a string that is exactly 32 characters long, and place within the double quotes instead of the value `key`. For instance if the key would be `IHaveToUse32CharactersForThisKey` then the file should look like this.
```
{
    "ENCRYPTION_KEY": "IHaveToUse32CharactersForThisKey"
}
```

## Run the Easee app
To run the app and see logs from the app in your computers terminal window, use `homey app run`. To install the app permanently via CLI then use `homey app install`. All commands are executed from the root folder of the app's file structure.