const Base = require('./base.model');
const env = require('../env');
const error = require('./errors.list');
const mongoose = require('mongoose');
const rp = require('request-promise');
const ProductModel = require('./product.model');
const DeliveryDurationInfoModel = require('./delivery_duration_info.model')
const DSSModel = require('./dss.model');
const moment = require('moment');
const _const = require('./const.list');
const ps = require('xml2js').parseString;
const WarehouesModel = require('./warehouse.model');
const models = require('../mongo/models.mongo');


const dailyReportHour = env.dailyReportHour;

let crypto;
try {
  crypto = require('crypto');
} catch (e) {
  console.error(e);
}

const parseString = (input) => {
  return new Promise((resolve, reject) => {
    ps(input, function (err, result) {

      if (err)
        reject(err);

      resolve(result);
    });

  });


}

const inventoryCount = function (instance) {
  const inventory = instance.inventory;
  return inventory && inventory.length ? inventory.map(i => i.count - (i.reserved ? i.reserved : 0)).reduce((a, b) => a + b) : 0;
};

const actionObj = {
  shop: "1003",
  refund: "1004",
};

class Order extends Base {

  constructor(test = Order.test) {
    super('Order', test);
    this.OrderModel = this.model;
    this.test = test;
  }

  async getById(orderId) {
    try {

      let order = await this.OrderModel.findOne({
        _id: mongoose.Types.ObjectId(orderId)
      }).lean();

      return Promise.resolve(order);
    } catch (err) {
      console.log('-> ');
      throw err;
    }

  }

  /**
   * @param items
   *  product_id: the id of the product
   *  product_instance_id : the id of the product instance
   *  number : the number of product instances we want to add
   * @returns {Promise.<*>}
   */
  async addToOrder(user, items, updateQuery = {}, guest = false) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.noUser);
    if (!items || (items.length !== undefined && !items.length))
      return Promise.reject(error.bodyRequired);

    if (!items.length)
      items = [items];
    let newOrderLines = [];

    for (let item of items) {
      let pid = item.product_id;
      let piid = item.product_instance_id;
      let n = item.number || 1;

      if (!mongoose.Types.ObjectId.isValid(piid) || !mongoose.Types.ObjectId.isValid(pid))
        return Promise.reject(error.invalidId);
      user.id ? user._id = user.id : user._id = user._id;
      for (let i = 0; i < n; i++) {
        if (!user._id || !user.username) {
          newOrderLines.push({
            product_id: pid,
            product_instance_id: piid,
            campaignInfo: item.campaignInfo,
            product_price: item.price,
            paid_price: item.price - (item.price * item.campaignInfo.discount_ref / 100),
          });
        } else {
          newOrderLines.push({
            product_id: pid,
            product_instance_id: piid,
          });
        }
      }
    }

    // check that the product instance is not sold out
    return (new ProductModel(Order.test).getProduct(items[0].product_id)).then(prds => {
      const prdInst = prds.instances.find(el => mongoose.Types.ObjectId(el._id).equals(mongoose.Types.ObjectId(items[0].product_instance_id)));
      if (!prdInst)
        return Promise.reject(error.productIsSoldOut);
    }).then(() => {
      const query = Object.assign({
        customer_id: user.id ? user.id : null,
        is_cart: true,
        transaction_id: null
      }, updateQuery);

      return this.OrderModel.findOneAndUpdate(
        query, {
        $addToSet: {
          'order_lines': {
            $each: newOrderLines
          }
        },
        tickets: []

      }, {
        upsert: true,
        new: true
      });
    });
  }

  async changeStateAsCanceled(order, orderLine) {
    try {
      return this.OrderModel.findOneAndUpdate({
        _id: mongoose.Types.ObjectId(order._id),
        'order_lines._id': mongoose.Types.ObjectId(orderLine._id)
      }, {
        $set: {
          'order_lines.$.cancel': true
        }
      }, {
        new: true
      }).lean();

    } catch (err) {
      console.log('-> error on canceling order line');
      throw err;
    }
  }

  finalCheck(cartItems) {
    return Promise.all(cartItems
      .map(initialValues => new ProductModel(Order.test).getProduct(initialValues.product_id.toString())
        .then(product => Object.assign(product, {
          initialValues
        }))))
      .then(arr => {
        arr.forEach(r => {
          r.errors = [];
          r.warnings = [];

          const foundInstance = r.instances.find(x => x._id.toString() === r.initialValues.product_instance_id);
          if (!foundInstance) {
            r.errors.push('soldOut');
            return;
          }

          r.count = inventoryCount(foundInstance);
          if (r.initialValues.quantity > r.count) {
            r.errors.push('soldOut');
          }

          r.price = foundInstance.price ? foundInstance.price : r.base_price;
          if (r.price !== r.initialValues.price) {
            r.warnings.push('priceChanged');
          }

          if (r.discount !== r.initialValues.discount) {
            r.warnings.push('discountChanged');
          }
        });
        return Promise.resolve(arr);
      })
      .catch(err => {
        return Promise.reject(err);
      })
  }


  async checkoutWithoutPayment(orderId, update) {
    try {


      const invoiceNumber = mongoose.Types.ObjectId().toString();
      const invoiceDate = moment().format("YYYY/MM/DD HH:mm:ss").toString();

      update.transaction_id = invoiceNumber;
      update.is_cart = false;

      let foundOrder;
      foundOrder = await this.OrderModel.findOneAndUpdate({
        _id: orderId
      }, {
        $set: update
      }, {
        new: true
      }).lean();

      let DSS = require('./dss.model');
      let dssModel = new DSS(this.test);
      await dssModel.startProcess(foundOrder);

      return Promise.resolve({
        invoiceNumber,
        invoiceDate,
      });
    } catch (err) {
      console.log('Err : ', err);
      throw err;
    }
  }

  async checkout(user, body) {
    try {
      let customer;
      if (user && user.access_level)
        throw new Error('users with role in system cannot place order');

      if (user && (!user.id || !body.order_id || body.cartItems))
        throw new Error('logged in users must have order id and cannot place cc orders')

      if ((!body.cartItems || !body.cartItems.length) && !body.order_id)
        throw new Error('order items cannot be found');

      if (!body.address)
        throw new Error('address must be declared');

      if (!body.is_collect && (!body.time_slot || !body.duration_id))
        throw new Error('time slot and duration id must be declared for not cc orders');

      if (body.hasOwnProperty('paymentType') && body.paymentType !== _const.PAYMENT_TYPE.cash && !user)
        throw new Error('other order payment type is only available for logged in users');

      let update = {
        is_collect: body.is_collect,
        total_amount: 0,
        address: body.address,
        order_time: new Date()
      };

      if (!body.is_collect) {
        update.delivery_info = {};
        update.delivery_info.time_slot = body.time_slot;
      } else {
        let foundWarehouse = (await new WarehouesModel(this.test).getShops()).find(x => x._id.toString() === update.address.warehouse_id);
        if (!foundWarehouse)
          throw error.WarehouseNotFound;

        update.address = Object.assign(update.address, foundWarehouse.address)

      }

      let coupon_code;
      let foundOrder;
      if (user) {
        foundOrder = await this.OrderModel.findOne({
          _id: mongoose.Types.ObjectId(body.order_id)
        }).lean();

        coupon_code = foundOrder.coupon_code;

        update.order_lines = foundOrder.order_lines;
      }
      /**
       * guest user => add new order lines
       */
      if (body.cartItems) {
        let order_lines = [];
        body.cartItems.forEach(x => {
          let counter = 0
          while (counter < x.number) {
            order_lines.push({
              product_id: mongoose.Types.ObjectId(x.product_id),
              product_instance_id: mongoose.Types.ObjectId(x.product_instance_id)
            });
            counter++;
          }
        });

        update.order_lines = order_lines;
      }

      await this.calculateOrderPrice(update, user, coupon_code);


      // update.total_amount includes calculated product price associated with campaigns and coupon code
      if (!body.is_collect && update.total_amount < env.free_delivery_amount) {

        let deliveryPricingResult = await (new DeliveryDurationInfoModel()).calculateDeliveryDiscount(body.duration_id, body.customer_id);
        if (deliveryPricingResult.deliery_days) {
          update.delivery_info.duration_days = deliveryPricingResult.deliery_days;
        }

        update.delivery_info.delivery_cost = deliveryPricingResult.delivery_cost;
        update.total_amount += deliveryPricingResult.delivery_cost;

        if (deliveryPricingResult.delivery_discount) {
          update.delivery_info.duration_discount = deliveryPricingResult.delivery_discount;
          update.total_amount -= deliveryPricingResult.delivery_discount;
        }
      }

      let CustomerModel = require('./customer.model');

      if (body.useLoyalty) {
        customer = await new CustomerModel(this.test).getById(user.id);
        // use the last updated loyalty in online db
        if (customer.loyalty_points > 0) {
          update.loyalty_points = customer.loyalty_points;
          update.loyalty_discount = update.loyalty_points * env.loyalty_value;
          update.total_amount -= update.loyalty_discount;

          if (update.total_amount === 0) {
            return await this.checkoutWithoutPayment(foundOrder._id, update);
          }
        }
      }


      if (body.paymentType === _const.PAYMENT_TYPE.balance) {

        if (!customer) {
          customer = await new CustomerModel(this.test).getById(user.id);
        }

        if (customer.balance > 0) {
          if (customer.balance >= update.total_amount) {
            update.used_balance = update.total_amount;
            update.total_amount = 0;
            await new CustomerModel(this.test).changeBalance(user.id, (-1 * update.used_balance));
            return this.checkoutWithoutPayment(foundOrder._id, update);
          }
          else {
            let usableBalance = customer.balance;
            update.total_amount -= usableBalance;
            update.used_balance = usableBalance;
          }
        } else {
          return Promise.reject(error.notEnoughBalance);
        }
      }

      let signedString;
      const time = moment().format("YYYY/MM/DD HH:mm:ss").toString();
      const redirectAddress = env.redirect_address;
      const invoiceNumber = mongoose.Types.ObjectId().toString();
      const invoiceDate = time;
      const timeStamp = time;
      const action = actionObj.shop;
      let email = user ? user.username : body.address.recipient_email;
      let mobile = user ? user.mobile_no : body.address.recipient_mobile_no;
      let dataArr = ["",
        env.merchant_code,
        env.terminal_code,
        invoiceNumber,
        invoiceDate,
        update.total_amount * 10,
        redirectAddress,
        action,
        timeStamp,
        ""
      ];

      signedString = this.generateDigitalSignature(dataArr);

      const formData = {
        invoiceNumber,
        invoiceDate,
        amount: update.total_amount * 10, // convert to Rials
        terminalCode: env.terminal_code,
        merchantCode: env.merchant_code,
        redirectAddress,
        timeStamp,
        action,
        mobile,
        email,
        sign: signedString,
      };


      update.IPG_data = {
        result: null,
        action: actionObj.shop,
        invoice_number: formData.invoiceNumber,
        invoice_date: formData.invoiceDate,
        transaction_id: null,
        trace_number: null,
        reference_number: null,
        transaction_date: null,
        terminal_code: env.terminal_code,
        merchant_code: env.merchant_code,
        amount: update.total_amount * 10,
      };

      if (user) {
        foundOrder = await this.OrderModel.findOneAndUpdate({
          _id: body.order_id
        }, {
          $set: update
        }, {
          new: true
        }).lean();
      } else {
        update.is_cart = true;  
        foundOrder = await this.OrderModel.create(update);
        foundOrder = foundOrder.toObject();
      }

      return Promise.resolve(formData);
    } catch (err) {
      console.log('Err : ', err);
      throw err;
    }
  }

  async calculateOrderPrice(update, user, coupon_code) {


    let products = await (new ProductModel()).findOrderProductsInfo(update.order_lines.map(x => {
      return {
        product_id: x.product_id,
        product_instance_id: x.product_instance_id
      }
    }));

    if (!products || !products.length)
      throw new Error('no product found for current order');

    const now = moment();

    update.order_lines.forEach(ol => {
      let foundProdcut = products.find(x => {
        if (x._id.toString() !== ol.product_id.toString())
          return false;

        return (x.instances.find(x => x._id.toString() === ol.product_instance_id.toString()))
      });

      if (!foundProdcut)
        throw new Error('no product found for current order line');

      let foundInstance = foundProdcut.instances.find(x => x._id.toString() === ol.product_instance_id.toString());
      if (!foundInstance)
        throw new Error('instance not found for current order line')

      ol.product_price = foundInstance.price;

      if (foundProdcut.campaignInfo && foundProdcut.campaignInfo.length) {
        let validCampaigns = foundProdcut.campaignInfo.filter(x => (moment(x.start_date).isSameOrBefore(now)) && (moment(x.end_date).isSameOrAfter(now)));
        let discount = 0;
        if (validCampaigns && validCampaigns.length) {
          let max_discount_ref = Math.max(...validCampaigns.map(x => x.discount_ref));
          ol.campaign_info = validCampaigns.find(x => x.discount_ref === max_discount_ref);
          discount = Math.round(ol.product_price * ol.campaign_info.discount_ref / (100 * env.rounding_factor)) * env.rounding_factor;
          ol.campaign_info.discount = discount;
        }

        ol.paid_price = ol.product_price - discount;
      } else {
        ol.paid_price = ol.product_price;
      }

      update.total_amount += ol.paid_price
    });

    if (coupon_code) {
      let foundCouponCampaign = await this.checkCouponValidation(user, {
        coupon_code
      })
      if (foundCouponCampaign) {

        let CampaignModel = require('./campaign.model');
        let discount = new CampaignModel(this.test).calculateCampaignDiscount(totalProductPrice, foundCouponCampaign.discount_ref);
        update.coupon_discount = discount
        update.total_amount -= discount;
      }
    }
  }

  async readPayResult(IPGRecData) {
    try {

      let formData = null;
      if (IPGRecData && IPGRecData.tref) {
        formData = {
          invoiceUID: IPGRecData.tref,
        };
      } else {
        formData = {
          merchantCode: env.merchant_code,
          terminalCode: env.terminal_code,
          invoiceNumber: IPGRecData.invoiceNumber,
          invoiceDate: IPGRecData.invoiceDate,
        };
      }

      let foundOrder = await this.OrderModel.aggregate([{
        $match: {
          $and: [
            {
              is_cart: true
            },
            {
              'IPG_data.transaction_id': null
            },
            {
              'IPG_data.invoice_number': IPGRecData.invoiceNumber
            },
            {
              'IPG_data.invoice_date': IPGRecData.invoiceDate
            }
          ]
        }
      },
      {
        $unwind: {
          path: '$order_lines',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'product',
          localField: 'order_lines.product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$product.instances', // it makes product.instances, single element array for each instance
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          order_line_id: '$order_lines._id',
          total_amount: '$total_amount',
          IPG_data: '$IPG_data',
          used_balance: '$used_balance',
          used_point: '$used_point',
          instance: {
            '_id': '$product.instances._id',
            'product_id': '$product._id',
            'product_name': '$product.name',
            'size': '$product.instances.size',
            'inventory': '$product.instances.inventory'
          },
          cmp_value: {
            $cmp: ['$order_lines.product_instance_id', '$product.instances._id']
          }
        },
      },
      {
        $match: {
          cmp_value: {
            $eq: 0
          }
        }
      },
      {
        $group: {
          _id: '$instance._id',
          order_id: {
            $first: '$_id',
          },
          order_line_id: {
            $first: '$order_line_id',
          },
          instance: {
            $first: '$instance',
          },
          quantity: {
            $sum: 1
          },
          total_amount: {
            $first: '$total_amount'
          },
          IPG_data: {
            $first: '$IPG_data'
          }
        }
      },
      {
        $group: {
          _id: '$order_id',
          order_lines: {
            $push: {
              order_line_id: '$order_line_id',
              instance: '$instance',
              quantity: '$quantity'
            }
          },
          total_amount: {
            $first: '$total_amount'
          },
          IPG_data: {
            $first: '$IPG_data'
          },
        }
      },
      ]);

      if (!foundOrder || foundOrder.length === 0)
        throw error.invalidInvoice;

      foundOrder = foundOrder[0];

      let orderTotalAmount = foundOrder.total_amount * 10; // convert to Rials


      let res = await rp({
        method: 'post',
        uri: env.check_transaction_result_url,
        form: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        json: true,
        resolveWithFullResponse: true
      });

      let parsedResult = await parseString(res.body);

      if (!parsedResult || !parsedResult.resultObj)
        throw new Error(`cannot parse IPG check transaction result of ${res.body}. the parsed result is: ${parsedResult}`)

      let xmlToNodeReadRes = parsedResult.resultObj;

      if (orderTotalAmount.toString() !== xmlToNodeReadRes.amount[0].toString())
        throw error.invalidInvoice;


      if (xmlToNodeReadRes.result[0] === 'False') { // transaction is unsuccessful (result: false), no need to continue,
        // should reject a meaningful error
        console.log('Shop Unsuccessful : NOTRANSACTON Or NOINVOICE happened ');
        throw new Error(xmlToNodeReadRes);
      }

      if (xmlToNodeReadRes.result[0] === 'True') { // transaction is successful (result: true), need to final checkout
        if (xmlToNodeReadRes.terminalCode[0] !== env.terminal_code.toString() ||
          xmlToNodeReadRes.merchantCode[0] !== env.merchant_code.toString() ||
          xmlToNodeReadRes.action[0] !== foundOrder.IPG_data.action.toString() ||
          xmlToNodeReadRes.invoiceDate[0].toString() !== IPGRecData.invoiceDate || // should check in correct manner
          xmlToNodeReadRes.invoiceNumber[0].toString() !== foundOrder.IPG_data.invoice_number.toString()) {
          //should final check for last time
          console.log('Invoice information doesn\'t match with the original invoice');
          throw error.invalidInvoice;
        }
      }

      let cartItems = [];
      foundOrder.order_lines.forEach(el => {
        let count = 0;
        el.instance.inventory.forEach(inv => count += inv.count - inv.reserved);
        cartItems.push({
          product_instance_id: el.instance._id,
          product_id: el.instance.product_id,
          count: count,
          quantity: el.quantity,
        });
      });
      res = await this.finalCheckAfterPayment(cartItems);
      let soldOuts = res.filter(x => x.errors && x.errors.length && x.errors.includes('soldOut'));
      if (soldOuts && soldOuts.length) {
        console.log('product is sold out right before payment');
        throw error.soldOutBeforePayment;
      }
      let user;
      if (foundOrder.customer_id) {
        user = await models()['Customer'].findOne({
          _id: mongoose.Types.ObjectId(foundOrder.customer_id)
        })
      }
      let xmlToNodeVerifyRes = await this.verifyPayment(user, IPGRecData, xmlToNodeReadRes, foundOrder._id);
      return Promise.resolve({
        xmlToNodeReadRes,
        xmlToNodeVerifyRes
      });

    } catch (err) {
      console.log('-> error on pay result', err);
      throw err;
    }
  }

  finalCheckAfterPayment(cartItems) {
    return Promise.all(cartItems
      .map(initialValues => new ProductModel(Order.test).getProduct(initialValues.product_id.toString())
        .then(product => Object.assign(product, {
          initialValues
        }))))
      .then(arr => {
        arr.forEach((r, i) => {
          const foundInstance = r.instances.find(x => x._id.toString() === r.initialValues.product_instance_id.toString());
          r.errors = [];

          r.count = inventoryCount(foundInstance);
          if (r.initialValues.quantity > r.count) {
            r.errors.push('soldOut');
          }
        });
        return Promise.resolve(arr);
      })
      .catch(err => {
        return Promise.reject(err);
      })
  }

  async verifyPayment(user, data, xmlToNodeReadRes, orderId) {
    try {
      let time = moment().format("YYYY/MM/DD HH:mm:ss").toString();
      const dssModel = new DSSModel(Order.test);

      let dataArr = ["",
        env.merchant_code,
        env.terminal_code,
        data.invoiceNumber,
        data.invoiceDate,
        xmlToNodeReadRes.amount[0],
        time,
        ""
      ];
      const signedString = this.generateDigitalSignature(dataArr);
      let shopConfirmData = {
        merchantCode: env.merchant_code,
        terminalCode: env.terminal_code,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        amount: xmlToNodeReadRes.amount[0],
        timeStamp: time,
        sign: signedString,
      };

      let res = await rp({
        method: 'post',
        uri: env.verify_payment_url,
        form: shopConfirmData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        json: true,
        resolveWithFullResponse: true
      });

      let parsedResult = await parseString(res.body);

      if (!parsedResult || !parsedResult.actionResult)
        throw new Error(`cannot parse IPG verify payment result of ${res.body}. the parsed result is: ${JSON.stringify(parsedResult, null, 2)}`)


      let xmlToNodeVerifyRes = parsedResult.actionResult;

      if (xmlToNodeVerifyRes.result[0] !== 'True')
        throw new Error('payment qoute result of IPG is not True', xmlToNodeReadRes);

      let updatedOrder = await this.OrderModel.findOneAndUpdate({
        _id: orderId
      }, {
        $set: {
          is_cart: false,
          transaction_id: data.tref,
          IPG_data: {
            result: xmlToNodeReadRes.result[0],
            action: xmlToNodeReadRes.action[0],
            invoice_number: data.invoiceNumber,
            invoice_date: data.invoiceDate,
            transaction_id: data.tref,
            trace_number: xmlToNodeReadRes.traceNumber[0],
            reference_number: xmlToNodeReadRes.referenceNumber[0],
            transaction_date: xmlToNodeReadRes.transactionDate[0],
            terminal_code: env.terminal_code,
            merchant_code: env.merchant_code,
            amount: xmlToNodeReadRes.amount[0],
          }
        }
      }, {
        new: true
      }).lean();

      if (!updatedOrder)
        throw error.orderNotFound;

      if (user && !user.access_level) {

        if (updatedOrder.used_balance && updatedOrder.used_balance > 0) {

          let CustomerModel = require('./customer.model');
          await new CustomerModel(this.test).changeBalance(user.id, (-1 * updatedOrder.used_balance));

          // await models()['Customer' + (Order.test ? 'Test' : '')].findOneAndUpdate({
          //   _id: mongoose.Types.ObjectId(res.customer_id),
          // },
          //   {$set: {loyalty_points: res.loyalty.final_point}}
          // )
        }
      }
      await dssModel.startProcess(updatedOrder);

      return Promise.resolve(xmlToNodeVerifyRes);

    } catch (err) {
      console.log('-> error on verifing order payment', err);
      throw err;
    }

  }

  async demoVerifyPayment(orderId) {
    try {
      if (this.test) {
        let order = await this.OrderModel.findOne({
          _id: orderId
        }).lean();

        if (!order)
          throw error.orderNotFound;

        let DSS = require('./dss.model');
        return new DSS(this.test).startProcess(order);
      }
    } catch (err) {
      console.log('-> error on verifing order payment', err);
      throw err;
    }
  }


  generateDigitalSignature(dataArr) {
    try {
      const privateKey = env.private_key;
      let arr = ['-----BEGIN PRIVATE KEY-----'];
      for (let i = 0; i < Math.ceil(privateKey.length / 64); i++) {
        arr.push(privateKey.slice(i * 64, (i + 1) * 64));
      }
      arr.push('-----END PRIVATE KEY-----');
      const pemKey = arr.join('\n');

      const dataString = dataArr.join('#');
      const sign = crypto.createSign('SHA1');
      sign.write(dataString, 'utf8');
      sign.end();
      return sign.sign(pemKey, 'base64');
    } catch (err) {
      console.log('--> ', err);
      throw error.generateSignatureFailed;
    }
  }

  /**
   * @param body
   *  product_instance_id : the id of the product instance
   *  number : the number of product instances we want to remove
   * @returns {Promise.<*>}
   */
  removeFromOrder(user, body) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.noUser);
    if (!body)
      return Promise.reject(error.bodyRequired);

    let piid = body.product_instance_id;
    let n = body.number || -1;

    if (!mongoose.Types.ObjectId.isValid(piid))
      return Promise.reject(error.invalidId);

    if (n === -1 || n === null) {
      return this.OrderModel.update({
        customer_id: user.id,
        is_cart: true
      }, {
        $pull: {
          'order_lines': {
            product_instance_id: piid
          }
        }
      }, {
        multi: true
      });
    } else {

      return this.OrderModel.aggregate([{
        $match: {
          customer_id: mongoose.Types.ObjectId(user.id),
          is_cart: true
        }
      },
      {
        $unwind: {
          path: '$order_lines',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          'order_lines.product_instance_id': mongoose.Types.ObjectId(piid)
        }
      },
      {
        $limit: n
      }
      ])
        .then(res => {
          let ids = res.map(x => x.order_lines._id);
          return this.OrderModel.update({
            customer_id: user.id,
            is_cart: true,
          }, {
            $pull: {
              'order_lines': {
                _id: {
                  $in: ids
                }
              }
            }
          })
        });
    }
  }

  getOrders(user) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.noUser);
    return this.OrderModel.aggregate(
      [{
        $match: {
          $and: [{
            customer_id: mongoose.Types.ObjectId(user.id)
          },
          {
            is_cart: false
          },
          {
            transaction_id: {
              $ne: null
            }
          },
          {
            address: {
              $ne: null
            }
          },
          ]
        }
      },
      {
        $unwind: {
          path: '$order_lines',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'product',
          localField: 'order_lines.product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$product.instances', // it makes product.instances, single element array for each instance
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          'last_ticket': {
            "$arrayElemAt": ["$tickets", -1]
          }
        }
      },
      {
        $addFields: {
          'order_lines_ticket': {
            "$arrayElemAt": ["$order_lines.tickets", -1]
          }
        }
      },
      {
        $project: {
          _id: '$_id',
          transaction_id: '$transaction_id',
          address: '$address',
          total_amount: '$total_amount',
          coupon_discount: '$coupon_discount',
          is_collect: '$is_collect',
          coupon_code: '$coupon_code',
          used_point: '$used_point',
          used_balance: '$used_balance',
          order_time: '$order_time',
          tickets: '$tickets',
          last_ticket: '$last_ticket',
          order_lines: {
            order_line_id: '$order_lines._id',
            paid_price: '$order_lines.paid_price',
            adding_time: '$order_lines.adding_time',
            tickets: '$order_lines.tickets',
            product_instance: {
              '_id': '$product.instances._id',
              'barcode': '$product.instances.barcode',
              'size': '$product.instances.size',
              'product_color_id': '$product.instances.product_color_id'
            },
            product: {
              '_id': "$product._id",
              'date': "$product.date",
              'colors': "$product.colors",
              'reviews': "$product.reviews",
              "instances": "$product.instances",
              "campaigns": "$product.campaigns",
              "name": "$product.name",
              "product_type": "$product.product_type",
              "brand": "$product.brand",
              "base_price": "$product.base_price",
              "desc": "$product.desc",
              "tags": "$product.tags",
              "__v": "$product.__v"
            },
            order_lines_ticket: '$order_lines_ticket',
            cancel: '$order_lines.cancel'
          },
          cmp_value: {
            $cmp: ['$order_lines.product_instance_id', '$product.instances._id']
          }
        },
      },
      {
        $match: {
          cmp_value: {
            $eq: 0
          }
        }
      },
      {
        $sort: {
          'adding_time': 1,
        }
      },
      {
        $group: {
          _id: '$_id',
          "address": {
            "$first": "$address"
          },
          "transaction_id": {
            "$first": "$transaction_id"
          },
          "used_balance": {
            "$first": "$used_balance"
          },
          "coupon_discount": {
            "$first": "$coupon_discount"
          },
          "total_amount": {
            "$first": "$total_amount"
          },
          "is_collect": {
            "$first": "$is_collect"
          },
          "coupon_code": {
            "$first": "$coupon_code"
          },
          "used_point": {
            "$first": "$used_point"
          },
          "order_time": {
            "$first": "$order_time"
          },
          order_lines: {
            $push: "$order_lines"
          },
          "tickets": {
            "$first": "$tickets"
          },
          last_ticket: {
            $first: "$last_ticket"
          }

        }
      },
      ]).then(res => {
        return Promise.resolve({
          orders: res
        }).catch(e => {
          console.log(e);
        });

      });
  }

  getCartItems(user) {
    if (!user || user.access_level !== undefined)
      return Promise.reject(error.instanceDataRequired);

    return this.OrderModel.aggregate([{
      // $match: {customer_id: mongoose.Types.ObjectId(user.id), 'address._id': {$exists: false}, is_cart: true}
      $match: {
        customer_id: mongoose.Types.ObjectId(user.id),
        is_cart: true
      }
    },
    {
      $unwind: {
        path: '$order_lines',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: '$order_lines.product_instance_id',
        instance_id: {
          $first: '$order_lines.product_instance_id'
        },
        order_id: {
          $first: '$_id'
        },
        product_id: {
          $first: '$order_lines.product_id'
        },
        quantity: {
          $sum: 1
        },
        coupon_code: {
          $first: '$coupon_code'
        },
      }
    }
    ]);

  }

  async checkCouponValidation(user, body) {
    try {

      if (!user || user.access_level)
        return Promise.reject(error.noUser);

      if (!body.coupon_code)
        return Promise.reject(error.noCouponCode);

      let CampaignModel = require('./campaign.model');
      let foundCampaign = await new CampaignModel(this.test).getActiveCampaignByCoupon(body.coupon_code);
      if (!foundCampaign)
        throw new Error('no active campaign found for this coupon code')

      let foundPreOrder = await this.OrderModel.findOne({
        coupon_code: body.coupon_code,
        customer_id: user.id,
        is_cart: false
      });
      if (foundPreOrder)
        throw new Error('coupon code has been used before')

      return Promise.resolve(foundCampaign);

    } catch (err) {
      console.log('-> ');
      throw err;
    }

  }

  // also used for clearing a coupon code from a cart
  async applyCouponCode(user, body) {
    try {

      if (!body.coupon_code)
        throw new Error('coupon code is required');

      if (!user || user.access_level !== undefined)
        return Promise.reject(error.noUser);

      let CampaignModel = require('./campaign.model');
      let foundCampaign = await new CampaignModel(this.test).getActiveCampaignByCoupon(body.coupon_code);
      if (!foundCampaign)
        throw new Error('no active campaign found for this coupon code')


      return this.OrderModel.update({
        customer_id: mongoose.Types.ObjectId(user.id),
        transaction_id: {
          $eq: null
        },
        is_cart: true
      }, {
        $set: {
          coupon_code: foundCampaign.coupon_code || null,
          coupon_discount: foundCampaign.discount_ref || null
        }
      }, {
        upsert: true
      });
    } catch (err) {
      console.log('-> error on apllying coupon code', err);
      throw err;
    }

  }

  async getDailySalesReport(user) {

    let today = moment(moment().format('YYYY-MM-DD')).set({
      'hour': dailyReportHour,
      'minute': '00',
      'second': '00'
    }).toDate();

    let yesterday = moment(moment().add(-1, 'd').format('YYYY-MM-DD')).set({
      'hour': dailyReportHour,
      'minute': '00',
      'second': '00'
    }).toDate();


    let result = await
      new Order(this.test).model.aggregate([{
        $match: {
          $and: [{
            is_cart: false
          },
          {
            transaction_id: {
              $ne: null
            }
          },
          {
            order_time: {
              $gte: yesterday,
              $lte: today
            },
          }
          ]
        }
      }, {
        $lookup: {
          from: 'customer',
          localField: 'customer_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          'total_order_lines': {
            $size: '$order_lines'
          }
        }
      },
      {
        $unwind: {
          path: '$order_lines',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          customer: {
            '_id': '$customer._id',
            'first_name': '$customer.first_name',
            'surname': '$customer.surname'
          },
          order_time: 1,
          total_amount: 1,
          total_order_lines: '$total_order_lines',
        }
      },
      {
        $group: {
          _id: '$_id',
          customer: {
            $first: '$customer'
          },
          order_time: {
            $first: '$order_time'
          },
          total_amount: {
            $first: '$total_amount'
          },
          total_order_lines: {
            $first: '$total_order_lines'
          }
        }
      }, {
        $sort: {
          'order_time': 1
        }
      }
      ]);
    return result;
  }

  async calculateDetailedPrice(order, orderLine, calculateDeliveryCost = false) {
    try {

      if (!order)
        throw new Error('order must be declared to calcualte detailed price');

      if (!calculateDeliveryCost && !orderLine)
        throw new Error('order and order line must be declared to calcualte detailed price of an order line');

      let CampaignModel = require('./campaign.model');

      if (!calculateDeliveryCost) {

        let result = orderLine.paid_price;
        if (order.coupon_code && order.coupon_discount) {
          let discount = new CampaignModel(this.test).calculateCampaignDiscount(result, order.coupon_discount);
          result -= discount;
        }
        return result;
      } else {

        return order.delivery_info && order.delivery_info.delivery_cost ? order.delivery_info.delivery_cost : 0
      }

    } catch (err) {
      console.log('-> error on calculate seperated price');
      throw err;
    }
  }
}

Order.test = false;
module.exports = Order;