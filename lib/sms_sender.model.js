const env = require('../env');
const rp = require('request-promise');

let token = null;

let oneTimeRedo = true;


async function enbaleRedoAfterFiveMinutes() {
  setTimeout(() => {
    oneTimeRedo = true;
  }, 5 * 60 * 1000)
}

async function sendCode(code, mobileNumber) {

  await getSMSToken();

  if (!token) {
    throw new Error('cannot send code without token');
  }

  try {
    let res = await rp({
      method: 'POST',
      body: {
        Code: code,
        MobileNumber: mobileNumber,
      },
      uri: env.send_sms_url,
      headers: {
        'Content-Type': 'application/json',
        'x-sms-ir-secure-token': token,
      },
      json: true,
      resolveWithFullResponse: true,
    });

    res = res.body;

    if (res && res.VerificationCodeId && res.IsSuccessful && res.Message === 'your verification code is sent') {
      console.log('-> ', `verification sms has been sent to: ${mobileNumber}`);
      oneTimeRedo = true;
      return;
    };

    if (!res)
      throw new Error('no response from sms.ir');

    if (!res.IsSuccessful || !res.VerificationCodeId) {
      if (oneTimeRedo) {
        token = null;
        await getSMSToken();
        sendCode(code, mobileNumber)
        oneTimeRedo = false;
      } else {
        enbaleRedoAfterFiveMinutes();
      }
    }

    return Promise.resolve(true);

  } catch (err) {
    console.log('-> error on sending code by sms ', err);
  }

}

async function getSMSToken() {
  try {

    if (token)
      return token;

    let res = await rp({
      method: 'POST',
      body: {
        UserApiKey: env.api_key,
        SecretKey: env.secret_key,
      },
      uri: env.token_url,
      json: true,
      jar: null,
      resolveWithFullResponse: true,
    });

    res = res.body;

    if (res && res.TokenKey && res.IsSuccessful) {
      token = res.TokenKey;
      console.log('-> sms token is got successfuly! ');
    } else {
      throw new Error(JSON.stringify(res, null, 2));
    }

  } catch (err) {  // come here when methode is get for example
    console.error('-> error on request token for sending sms. ', err);
  }
}

getSMSToken();

module.exports = {
  sendCode
};
