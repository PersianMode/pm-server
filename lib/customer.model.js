/**
 * Created by Eabasir on 30/02/2018.
 */
const Person = require('./person.model');
const error = require('./errors.list');
const helpers = require('./helpers');
const _const = require('./const.list');
const randomString = require('randomstring');
const mongoose = require('mongoose');
const env = require('../env');
const smsSender = require('../lib/sms_sender.model');
const emailSender = require('./email_sender');
const rp = require('request-promise');
const Offline = require('./offline.model');


class Customer extends Person {
  constructor(test = Customer.test) {
    super(test, 'Customer');
    this.CustomerModel = this.model;

    this.verificationItems = {
      mobile: 'mobile',
      email: 'email'
    };
  }

  load(username, password) {
    this.username = username.toLowerCase();
    this.password = password;
    return this.model.findOne({ username: username })
  }

  save(data) {
    let customer = new this.CustomerModel(data);
    return customer.save();
  }

  generateCode() {
    return randomString.generate({
      length: 6,
      charset: 'numeric',
    });

  }


  getById(customerId) {
    return this.CustomerModel.findById(customerId);
  }

  async registration(body) {

    if (['username', 'password', 'first_name', 'surname', 'mobile_no', 'dob', 'gender'].some(el => !body[el]))
      throw error.noCompleteRegisterData;

    body.secret = body.password;
    body.username = body.username.toLowerCase();

    // ToDo: if user was on editing register page, this should accept the new data :-?
    const preCostomer = await this.CustomerModel.findOne({
      $or: [{ username: body.username }, { mobile_no: body.mobile_no }]
    }).lean();

    if (preCostomer)
      throw error.customerExist;

    body.verification_code = this.generateCode();

    await this.save(body);
    return smsSender.sendCode(body.verification_code, body.mobile_no);
    //FIXME:
    // activation_link = null 
    // mailgun did not work and need to comment and activate account only with sms
    // this.sendActivationMail(body.username, false);
  }

  async sendVerificationSms(smsInfo) {

    try {
      let res = await rp({
        method: 'POST',
        body: {
          Code: smsInfo.code,
          MobileNumber: smsInfo.mobile_number,
        },
        uri: env.send_sms_url,
        headers: {
          'Content-Type': 'application/json',
          'x-sms-ir-secure-token': smsInfo.token_str,
        },
        json: true,
        resolveWithFullResponse: true,
      });
      return Promise.resolve(res);
    } catch (err) {
      console.log('-> error on send verificaiton code', err);
    }

  }

  async editUserBasicInfo(body, username) {

    if (['username', 'name', 'surname', 'dob'].some(el => !body[el]))
      throw error.noCompleteRegisterData;

    body.username = body.username.toLowerCase();

    const foundCostomer = await this.CustomerModel.findOne({
      $and: [
        { username: username },
        { mobile_verified: true },
        { email_verified: true },
      ]
    }).lean();
    if (!foundCostomer)
      throw error.customerIdNotValid;

    return this.CustomerModel.update({
      username: username,
    }, {
      $set: {
        national_id: body.national_id,
        first_name: body.name,
        surname: body.surname,
        username: body.username,
        dob: body.dob,
      }
    })
  }

  async setNewPassword(body) {

    if (!body.mobile_no)
      throw error.noMobileNo;

    if (!body.code)
      throw error.noCode;

    if (!body.password)
      throw error.noPass;

    const hash = await helpers.makeHash(body.password);
    const res = await this.CustomerModel.findOneAndUpdate({
      verification_code: body.code,
      mobile_no: body.mobile_no,
      mobile_verified: true,
      email_verified: true,
    }, {
      $set: {
        verification_code: null,
        secret: hash
      }
    });

    if (!res)
      throw error.noUser;

    return res;
  }

  async changePassword(body, username) {

    if (['old_pass', 'new_pass', 'retype_new_pass'].some(el => !body[el]))
      throw error.noCompleteChangesPassData;

    if (body.new_pass !== body.retype_new_pass)
      throw error.retypePassNotCompatibleWithNewPass;

    const foundCostomer = await this.CustomerModel.findOne({
      username: username,
      mobile_verified: true,
      email: true
    }).lean();

    if (!foundCostomer)
      throw error.customerIdNotValid

    await Person.checkPassword(res[0].secret, body.old_pass)
    const hash = helpers.makeHash(body.new_pass);

    return this.CustomerModel.update({
      username: username,
    }, {
      $set: {
        secret: hash,
      }
    })
  }

  async verification(user, code, username) {
    if (!user && !username)
      throw error.noUser;

    const theUsername = username ? username : user.username;

    if (!code)
      throw error.noCodeUsername;

    const foundCostomer = await this.CustomerModel.findOne({ verification_code: code, username: theUsername }).lean()
    if (!foundCostomer)
      throw error.codeNotFound;

    //TODO: 
    // need to added some fields for update same as isVerified
    // email_verified = true
    // mobile_verified = true
    const res = await this.CustomerModel.findOneAndUpdate({ username: theUsername }, {
      $set: {
        verification_code: null,
        mobile_verified: true,
        activation_link: null, // email verification now need to skip, because mailgun  is not available
        email_verified: true // email verification now need to skip, because mailgun  is not available
      }
    }, { new: true });

    return { done: 'ok', message: 'code is accepted', is_verified: res.mobile_verified };
  }

  async resendVerificationCode(user, username) {
    try {
      if (!username && user)
        username = user.username;

      const code = await this.generateCode();
      const foundCostomer = await this.CustomerModel.findOneAndUpdate({ 'username': username }, { $set: { verification_code: code } });

      smsSender.sendCode(code, foundCostomer.mobile_no);

      return Promise.resolve();

    } catch (err) {
      console.log('-> error on resend verification code', err);
      throw err;
    }

  }

  async forgotPassword(body) {
    if (!body.mobile_no)
      throw error.noMobileNo;

    const code = await this.generateCode()
    const updatedCustomer = await this.CustomerModel.findOneAndUpdate({
      mobile_no: body.mobile_no,
      mobile_verified: true,
      email_verified: true,
    }, {
      $set: {
        'verification_code': code,
      }
    }, { new: true });
    if (!updatedCustomer)
      throw error.noUser;
    smsSender.sendCode(code, updatedCustomer.mobile_no);
    return { done: 'ok' };
  }


  async setMobileNumber(user, mobile_no) {
    if (!user)
      throw error.noUser;

    if (!mobile_no)
      throw error.noUsernameMobileNo;

    const otherCostomer = await this.CustomerModel.findOne({
      username: { $ne: user.username },
      mobile_no
    }).lean();
    // mobile is not set on this user (comes from google oauth),
    // so no previous user with this mobile should exist
    if (otherCostomer)
      throw error.customerExist;

    const code = await this.generateCode();
    const updatedCustomer = await this.CustomerModel.findOneAndUpdate({
      username: user.username
    }, {
      $set: {
        mobile_no: mobile_no,
        verification_code: code,
      }
    }, { new: true });

    if (!updatedCustomer)
      throw error.noUser;


    smsSender.sendCode(code, updatedCustomer.mobile_no)
    return { done: 'ok', message: 'code sent to mobile number' };
  }

  async generateActivationLink() {
    const rndStr = randomString.generate({
      length: 80,
      charset: 'alphanumeric'
    });

    const customerWithSameString = await this.CustomerModel.findOne({
      activation_link: rndStr
    }).lean();

    if (customerWithSameString) {
      return this.generateActivationLink();
    }

    return rndStr;
  }

  async sendActivationMail(email) {

    try {

      let activation_link = await this.generateActivationLink();
      let updatedCustomer = await this.CustomerModel.findOneAndUpdate({
        username: email
      }, {
        activation_link
      }, {
        new: true
      });

      if (!updatedCustomer)
        throw error.noUser;

      let link = env.appAddress + '/login/oauth/' + activation_link;
      return emailSender.verificationSender(email, link);

    } catch (err) {
      console.log('-> error on send verification email', err);
      throw err;
    }

  }


  getCompleteName(firstName, surName) {
    if (firstName && surName)
      return firstName + ' ' + surName;
    if (firstName && !surName)
      return firstName;
    if (!firstName && surName)
      return surName;
    return 'user';
  }

  async checkActiveLink(activation_link) {
    const foundCustomers = await this.CustomerModel.find({ activation_link }).lean();
    if (foundCustomers.length > 1) {
      throw error.duplicateLink;
    }
    else if (foundCustomers.length === 1) {
      if (foundCustomers[0].email_verified)
        throw new Error('this email is already activated');

      const updatedCustomer = await this.CustomerModel.findOneAndUpdate({
        _id: foundCustomers[0]._id
      }, {
        activation_link: null,
        email_verified: true
      }, {
        new: true
      });
      return { done: 'ok', is_verified: res.email_verified }
    } else {
      throw error.expiredLink;
    }
  }

  async getBalanceAndPoint(user) {
    if (!user || user.access_level !== undefined)
      return Promise.resolve({ loyalty_points: 0, balance: 0 });

    await this.requestForLatestLoyalty(user)

    return this.CustomerModel.find({
      "_id": mongoose.Types.ObjectId(user.id),
    }, 'loyalty_points balance')
      .then(res => {
        if (res && res.length > 0)
          return Promise.resolve(res[0]);
      })
  }

  setAddress(user, body) {
    if (!user.username) {
      return Promise.reject(error.noCodeUsername)
    }
    if (!body.city || !body.street || !body.province) {
      return Promise.reject(error.addressIsRequired)
    }

    if (!body.recipient_mobile_no || !body.recipient_title || !body.recipient_national_id || !body.recipient_surname ||
      !body.recipient_name) {
      return Promise.reject(error.recipientInfoIsRequired)
    }

    if (!body._id) {
      return this.CustomerModel.findOneAndUpdate({
        _id: mongoose.Types.ObjectId(user.id),
        mobile_verified: true,
        email_verified: true,
      }, {
        $addToSet: {
          'addresses': {
            province: body.province,
            city: body.city,
            street: body.street,
            unit: body.unit,
            no: body.no,
            district: body.district,
            recipient_title: body.recipient_title,
            recipient_name: body.recipient_name,
            recipient_surname: body.recipient_surname,
            recipient_national_id: body.recipient_national_id,
            recipient_mobile_no: body.recipient_mobile_no,
            postal_code: body.postal_code,
            loc: { long: body.loc.long, lat: body.loc.lat }
          }
        }
      }, {
        new: true,
      });
    }
    else {
      return this.CustomerModel.findOneAndUpdate({
        _id: mongoose.Types.ObjectId(user.id),
        'addresses._id': mongoose.Types.ObjectId(body._id),
      }, {
        $set: {
          // national_id: body.recipient_national_id,
          'addresses.$.province': body.province,
          'addresses.$.city': body.city,
          'addresses.$.street': body.street,
          'addresses.$.unit': body.unit,
          'addresses.$.no': body.no,
          'addresses.$.district': body.district,
          'addresses.$.recipient_title': body.recipient_title,
          'addresses.$.recipient_name': body.recipient_name,
          'addresses.$.recipient_surname': body.recipient_surname,
          'addresses.$.recipient_national_id': body.recipient_national_id,
          'addresses.$.recipient_mobile_no': body.recipient_mobile_no,
          'addresses.$.postal_code': body.postal_code,
          'addresses.$.loc': { long: body.loc.long, lat: body.loc.lat }
        }
      })
    }
  }

  setCustomerShoesType(user, body) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.methodNotAllowed);
    if (!body)
      return Promise.resolve(error.bodyRequired);
    if (!body.shoesType)
      return Promise.resolve(error.bodyRequired);
    return this.CustomerModel.findOneAndUpdate({
      _id: mongoose.Types.ObjectId(user.id),
    }, {
      $set: {
        shoesType: body.shoesType
      }
    })
      .then(() => Promise.resolve());
  }

  getAddresses(user) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.noUser);

    return this.CustomerModel.find({
      "_id": mongoose.Types.ObjectId(user.id),
    }, 'first_name surname loyalty_points balance gender addresses balance mobile_no')
      .then(res => {
        if (res && res.length > 0)
          return Promise.resolve(res[0]);
        else
          return Promise.reject(error.noUsernameMobileNo);
      });
  }

  updateLoyalty(id, point) {

    return this.CustomerModel.update({
      _id: mongoose.Types.ObjectId(id)
    }, {
      $set: {
        loyalty_points: point
      }
    })

  }

  AddToWishList(user, body) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.noUser);
    if (!body)
      return Promise.reject(error.bodyRequired);

    let pro_id = body.product_id;
    let pro_ins_id = body.product_instance_id;

    if (!mongoose.Types.ObjectId.isValid(pro_id) || !mongoose.Types.ObjectId.isValid(body.product_color_id)) {
      return Promise.reject(error.invalidId);
    }

    let newWishListItem = [];

    newWishListItem.push({
      product_id: pro_id,
      product_instance_id: pro_ins_id ? pro_ins_id : null,
      product_color_id: body.product_color_id,
    });

    return this.CustomerModel.findOne({ _id: mongoose.Types.ObjectId(user.id) })
      .then(res => {
        const currentProducts = res.wish_list.filter(el => el.product_id.toString() === pro_id.toString());
        if (currentProducts.length) {
          if (pro_ins_id && currentProducts.some(el => el.product_instance_id && el.product_instance_id.toString() === pro_ins_id.toString())) {
            return Promise.reject(error.duplicateWishListItem);
          }
          else if (!pro_ins_id && !currentProducts.filter(el => el.product_color_id.toString() === body.product_color_id.toString()).length) {
            return this.CustomerModel.update({
              _id: mongoose.Types.ObjectId(user.id),
            }, {
              $addToSet: {
                'wish_list': {
                  $each: newWishListItem
                }
              }
            }, {
              upsert: true
            });
          }
          else if (!pro_ins_id && currentProducts.filter(el => el.product_color_id.toString() === body.product_color_id.toString()).length) {
            return Promise.reject(error.duplicateWishListItem);
          }
          else if (pro_ins_id && currentProducts.filter(el => el.product_color_id.toString() === body.product_color_id.toString()).length) {
            const curInst = currentProducts.find(el => el.product_color_id.toString() === body.product_color_id.toString());
            curInst.product_instance_id = pro_ins_id;
            curInst.product_color_id = body.product_color_id;
            return this.CustomerModel.update({
              _id: mongoose.Types.ObjectId(user.id),
            }, {
              $set: {
                wish_list: res.wish_list,
              }
            }, {
              upsert: true
            });
          }
          else if (pro_ins_id &&
            (currentProducts.filter(el => !el.product_instance_id && el.product_color_id.toString() === body.product_color_id.toString()).length
              || !currentProducts.filter(el => el.product_color_id.toString() === body.product_color_id.toString()).length)) {
            return this.CustomerModel.update({
              _id: mongoose.Types.ObjectId(user.id),
            }, {
              $addToSet: {
                'wish_list': {
                  $each: newWishListItem
                }
              }
            }, {
              upsert: true
            });
          }
        }
        return this.CustomerModel.update({
          _id: mongoose.Types.ObjectId(user.id),
        }, {
          $addToSet: {
            'wish_list': {
              $each: newWishListItem
            }
          }
        }, {
          upsert: true
        });
      });
  }

  getWishListItems(user) {
    if (!user || user.access_level !== undefined) {
      return Promise.reject(error.noUser);
    }
    return this.CustomerModel.aggregate(
      [
        {
          $match: {
            _id: mongoose.Types.ObjectId(user.id),
            email_verified: true,
            mobile_verified: true
          },
        },
        {
          $unwind: {
            path: '$wish_list',
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $lookup: {
            from: 'product',
            localField: 'wish_list.product_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        {
          $project: {
            wish_list: 1,
            product: 1
          }
        },
      ]
    ).then(res => {
      if (res.length) {
        res.forEach(el => {
          el.product[0].instances = el.wish_list.product_instance_id ? el.product[0].instances.filter(i => i._id.toString() === el.wish_list.product_instance_id.toString()) : null;
          el.product[0].colors = el.product[0].colors.filter(c => c._id.toString() === el.wish_list.product_color_id.toString());
        });
        return Promise.resolve(res);
      }
      else {
        return Promise.resolve([]);
      }
    })
      .catch(error => {
        console.log(error);
      });
  }

  removeFromWishList(user, wishItemId) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.noUser);
    if (!wishItemId)
      return Promise.reject(erro.wishItemIdIsRequired);

    return this.CustomerModel.update({
      '_id': mongoose.Types.ObjectId(user.id),
    },
      {
        $pull: {
          'wish_list': {
            '_id': mongoose.Types.ObjectId(wishItemId)
          }
        }
      })
  }

  setPreferences(user, body) {
    if (!user)
      return Promise.reject(error.noUser);

    let username = user.username;
    const updatedObj = {};

    if (body.preferred_size)
      updatedObj.preferred_size = body.preferred_size;
    if (body.preferred_brands)
      updatedObj.preferred_brands = body.preferred_brands;
    if (body.preferred_tags)
      updatedObj.preferred_tags = body.preferred_tags;
    updatedObj['is_preferences_set'] = true;

    return this.CustomerModel.update({ username }, {
      $set: updatedObj
    });
  }

  getPreferences(username) {
    return this.CustomerModel.aggregate([
      {
        $match: { username }
      },
      {
        $project: {
          _id: 1,
          preferred_brands: 1,
          preferred_size: 1,
          preferred_tags: 1,
          is_preferences_set: 1,
        }
      },
      {
        $unwind: {
          path: '$preferred_brands',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'brand',
          localField: 'preferred_brands',
          foreignField: '_id',
          as: 'brands',
        }
      },
      {
        $unwind: {
          path: '$brands',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$preferred_tags',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'tag',
          localField: 'preferred_tags',
          foreignField: '_id',
          as: 'tags',
        }
      },
      {
        $unwind: {
          path: '$tags',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'tag_group',
          localField: 'tags',
          foreignField: '_id',
          as: 'tag_groups',
        }
      },
      {
        $unwind: {
          path: '$tag_groups',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: '$_id',
          preferred_brands: { $addToSet: '$brands' },
          preferred_tags: {
            $addToSet: {
              _id: '$tags._id',
              name: '$tags.name',
              tag_group_name: '$tag_groups.name',
              tag_group_id: '$tag_groups._id'
            }
          },
          preferred_size: { $first: '$preferred_size' },
          is_preferences_set: { $first: '$is_preferences_set' },
        }
      }
    ])
      .then(res => {
        return res ? Promise.resolve(res[0]) : null
      });
  }

  changeBalance(id, addedBalance) {
    return this.CustomerModel.update({
      _id: mongoose.Types.ObjectId(id)
    }, {
      $inc: {
        balance: addedBalance
      }
    })

  }

  async requestForLatestLoyalty(customer) {
    let res = await new Offline(this.test).requestForCustomerLoyalty(customer.mobile_no);

    if (res) {
      res = JSON.parse(res);
      res = JSON.parse(res);
      await this.updateLoyalty(customer.id, res.CurrentPoint || 0);
      return res.CurrentPoint;
    }

    return 0;


  }


}

Customer.test = false;
module.exports = Customer;
