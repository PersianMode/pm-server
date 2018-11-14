const rp = require('request-promise');
const lib = require('../../../lib/index');
const models = require('../../../mongo/models.mongo');
const error = require('../../../lib/errors.list');
const mongoose = require('mongoose');
const _const = require('../../../lib/const.list');
const warehouses = require('../../../warehouses')

describe('POST Order - ORP', () => {
  let orders, products;
  let customer = {
    cid: null,
    jar: null
  };

  let customerAddress = {
    _id: mongoose.Types.ObjectId(),
    province: 'تهران',
    city: 'تهران',
    street: 'مطهری'
  };

  let colorIds = [
    mongoose.Types.ObjectId(),
    mongoose.Types.ObjectId(),
    mongoose.Types.ObjectId(),
    mongoose.Types.ObjectId()
  ];

  beforeEach(async done => {
    try {

      await lib.dbHelpers.dropAll()

      await models()['WarehouseTest'].insertMany(warehouses)
      let res = await lib.dbHelpers.addAndLoginCustomer('customer1', '123456', {
        first_name: 'test 1',
        surname: 'test 1',
        address: customerAddress
      });

      customer.cid = res.cid;
      customer.jar = res.rpJar;
      products = await models()['ProductTest'].insertMany([{
        article_no: 'xy123',
        name: 'sample 1',
        product_type: {
          name: 'sample type',
          product_type_id: mongoose.Types.ObjectId()
        },
        brand: {
          name: 'sample brand',
          brand_id: mongoose.Types.ObjectId()
        },
        base_price: 30000,
        desc: 'some description for this product',
        colors: [
          {
            color_id: colorIds[0],
            name: 'green'
          },
          {
            color_id: colorIds[1],
            name: 'yellow'
          },
          {
            color_id: colorIds[2],
            name: 'red'
          }
        ],
        instances: [{
          product_color_id: colorIds[0],
          size: "11",
          price: 2000,
          barcode: '0394081341',
          inventory: [{
            count: 3,
            reserved: 1,
            warehouse_id: warehouses[1]._id
          }, {
            count: 2,
            reserved: 0,
            warehouse_id: warehouses[2]._id
          }, {
            count: 3,
            reserved: 0,
            warehouse_id: warehouses[3]._id
          }, {
            count: 4,
            reserved: 0,
            warehouse_id: warehouses[4]._id
          }]
        },
        {
          product_color_id: colorIds[1],
          size: "10",
          price: 4000,
          barcode: '19231213123',
          inventory: [{
            count: 2,
            reserved: 2,
            warehouse_id: warehouses[1]._id
          }, {
            count: 1,
            reserved: 0,
            warehouse_id: warehouses[2]._id
          }, {
            count: 4,
            reserved: 0,
            warehouse_id: warehouses[3]._id
          }, {
            count: 5,
            reserved: 0,
            warehouse_id: warehouses[4]._id
          }]
        }
        ]
      }]);

      products = JSON.parse(JSON.stringify(products));

      orders = await models()['OrderTest'].insertMany([
        { // order 1 => a normal order which central warehosue has inventory for
          customer_id: customer.cid,
          order_time: new Date(),
          is_cart: false,
          order_lines: [{
            product_id: products[0]._id,
            product_instance_id: products[0].instances[0]._id,
            tickets: []
          }, {
            product_id: products[0],
            product_instance_id: products[0].instances[0]._id,
            tickets: []
          }]
        },
        { // order 2 => a normal order which central warehouse does'nt have inventory for
          customer_id: customer.cid,
          order_time: new Date(),
          is_cart: false,
          order_lines: [{
            product_id: products[0]._id,
            product_instance_id: products[0].instances[1]._id,
            tickets: []
          }]
        },
        { // order 3 => c&c order from paladium where has inventory for
          customer_id: customer.cid,
          order_time: new Date(),
          is_cart: false,
          order_lines: [{
            product_id: products[0]._id,
            product_instance_id: products[0].instances[0]._id,
            tickets: []
          }, {
            product_id: products[0]._id,
            product_instance_id: products[0].instances[0]._id,
            tickets: []
          }]
        },
        { // order 4 => c&c order from paladium where doesn't have enough inventory for as well as central (provided from sana and paladium )
          customer_id: customer.cid,
          order_time: new Date(),
          is_cart: false,
          order_lines: [{
            product_id: products[0]._id,
            product_instance_id: products[0].instances[1]._id,
            tickets: []
          }, {
            product_id: products[0]._id,
            product_instance_id: products[0].instances[1]._id,
            tickets: []
          }]
        }
      ]);

      orders = JSON.parse(JSON.stringify(orders));
      done();
    } catch (err) {
      console.log(err);
    };
  }, 15000);

  it('senario 1 : a normal order (order 1) which central warehosue has inventory for ', async function (done) {
    try {
      this.done = done;

      let PreInventory = products[0].instances[0].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[1]._id.toString());
      let transaction_id = mongoose.Types.ObjectId();
      let res = await rp({
        method: 'POST',
        uri: lib.helpers.apiTestURL(`checkout`),
        body: {
          order_id: orders[0]._id,
          address: customerAddress,
          transaction_id,
          used_point: 0,
          used_balance: 0,
          total_amount: 0,
          is_collect: false,
          time_slot: {
            lower_bound: 18,
            upper_bound: 22
          },
          duration_days: 3,
          paymentType: 1
        },
        json: true,
        resolveWithFullResponse: true,
        jar: customer.jar
      });
      expect(res.statusCode).toBe(200);
      let foundOrder = await models()['OrderTest'].findById(orders[0]._id);

      expect(foundOrder.tickets.length).toBe(1);
      expect(foundOrder.tickets[0].status).toBe(_const.ORDER_STATUS.WaitForAggregation);
      expect(foundOrder.tickets[0].receiver_id).toBeUndefined();


      expect(foundOrder.transaction_id.toString()).toBe(transaction_id.toString());
      expect(foundOrder.is_collect).toBe(false);
      expect(foundOrder.is_cart).toBeFalsy();
      expect(foundOrder.address._id.toString()).toBe(customerAddress._id.toString());

      let foundProduct = await models()['ProductTest'].findById(products[0]._id).lean();

      let newInventory = foundProduct.instances[0].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[1]._id.toString());
      expect(newInventory.count).toBe(PreInventory.count);
      expect(newInventory.reserved).toBe(PreInventory.reserved + 2);

      done();
    } catch (err) {
      lib.helpers.errorHandler.bind(this)(err)
    };
  });

  it('senario 2 : a normal order (order 2) which central warehouse does\'nt have inventory for', async function (done) {
    try {
      this.done = done;

      let PreCentralInventory = products[0].instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[1]._id.toString());

      let PrePaladiumInventory = products[0].instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[2]._id.toString());

      let transaction_id = mongoose.Types.ObjectId();
      let res = await rp({
        method: 'POST',
        uri: lib.helpers.apiTestURL(`checkout`),
        body: {
          order_id: orders[1]._id,
          address: customerAddress,
          transaction_id,
          used_point: 0,
          used_balance: 0,
          total_amount: 0,
          is_collect: false,
          time_slot: {
            lower_bound: 18,
            upper_bound: 22
          },
          duration_days: 3,
          paymentType: 1
        },
        json: true,
        resolveWithFullResponse: true,
        jar: customer.jar
      });
      expect(res.statusCode).toBe(200);

      let foundProduct = await models()['ProductTest'].findById(products[0]._id).lean();

      let newCentralInventory = foundProduct.instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[1]._id.toString());

      let newPaladiumInventory = foundProduct.instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[2]._id.toString());

      expect(newCentralInventory.count).toBe(PreCentralInventory.count);
      expect(newCentralInventory.reserved).toBe(PreCentralInventory.reserved);

      expect(newPaladiumInventory.count).toBe(PrePaladiumInventory.count);
      expect(newPaladiumInventory.reserved).toBe(PrePaladiumInventory.reserved + 1);

      done();
    } catch (err) {
      lib.helpers.errorHandler.bind(this)(err)
    };
  });

  it('senario 3 : c&c order (order 3) from paladium where has inventory for', async function (done) {
    try {
      this.done = done;

      let PreCentralInventory = products[0].instances[0].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[1]._id.toString());

      let PrePaladiumInventory = products[0].instances[0].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[2]._id.toString());

      let transaction_id = mongoose.Types.ObjectId();
      let res = await rp({
        method: 'POST',
        uri: lib.helpers.apiTestURL(`checkout`),
        body: {
          order_id: orders[2]._id,
          address: warehouses[2].address, // paladium
          transaction_id,
          used_point: 0,
          used_balance: 0,
          total_amount: 0,
          is_collect: true,
        },
        json: true,
        resolveWithFullResponse: true,
        jar: customer.jar
      });
      expect(res.statusCode).toBe(200);

      let foundOrder = await models()['OrderTest'].findById(orders[2]._id);
      expect(foundOrder.transaction_id.toString()).toBe(transaction_id.toString());
      expect(foundOrder.is_collect).toBe(true);
      expect(foundOrder.is_cart).toBeFalsy();
      expect(foundOrder.address._id.toString()).toBe(warehouses[2].address._id.toString());

      expect(foundOrder.tickets.length).toBe(1);
      expect(foundOrder.tickets[0].status).toBe(_const.ORDER_STATUS.WaitForAggregation);
      expect(foundOrder.tickets[0].receiver_id).toBeUndefined();


      let foundProduct = await models()['ProductTest'].findById(products[0]._id).lean();

      let newCentralInventory = foundProduct.instances[0].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[1]._id.toString());

      let newPaladiumInventory = foundProduct.instances[0].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[2]._id.toString());

      // central warehouse must not be included in c&c orders
      expect(newCentralInventory.count).toBe(PreCentralInventory.count);
      expect(newCentralInventory.reserved).toBe(PreCentralInventory.reserved);

      expect(newPaladiumInventory.count).toBe(PrePaladiumInventory.count);
      expect(newPaladiumInventory.reserved).toBe(PrePaladiumInventory.reserved + 2);

      done();
    } catch (err) {
      lib.helpers.errorHandler.bind(this)(err)
    };
  });

  it('senario 4 : c&c order (order 4) from paladium where doesn\'t have enough inventory for as well as central (provided from sana and paladium )', async function (done) {
    try {
      this.done = done;

      let PrePaladiumInventory = products[0].instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[2]._id.toString());

      let PreSanaInventory = products[0].instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[3]._id.toString());

      let transaction_id = mongoose.Types.ObjectId();
      let res = await rp({
        method: 'POST',
        uri: lib.helpers.apiTestURL(`checkout`),
        body: {
          order_id: orders[3]._id,
          address: warehouses[2].address, // paladium
          transaction_id,
          used_point: 0,
          used_balance: 0,
          total_amount: 0,
          is_collect: true,
        },
        json: true,
        resolveWithFullResponse: true,
        jar: customer.jar
      });
      expect(res.statusCode).toBe(200);

      let foundOrder = await models()['OrderTest'].findById(orders[3]._id);
      let foundProduct = await models()['ProductTest'].findById(products[0]._id).lean();

      let newPaladiumInventory = foundProduct.instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[2]._id.toString());

      let newSanaInventory = foundProduct.instances[1].inventory.find(x =>
        x.warehouse_id.toString() === warehouses[3]._id.toString());

      expect(newPaladiumInventory.count).toBe(PrePaladiumInventory.count);
      expect(newPaladiumInventory.reserved).toBe(PrePaladiumInventory.reserved + 1);

      expect(newSanaInventory.count).toBe(PreSanaInventory.count);
      expect(newSanaInventory.reserved).toBe(PreSanaInventory.reserved + 1);

      done();
    } catch (err) {
      lib.helpers.errorHandler.bind(this)(err)
    };
  });


});

describe('POST Order - ORP on mismatch', () => {
  let orders, products, centralWarehouse;
  let ShopClerk = {
    cid: null,
    jar: null
  };

  let colorIds = [
    mongoose.Types.ObjectId(),
    mongoose.Types.ObjectId(),
  ];

  beforeEach(async done => {
    try {

      await lib.dbHelpers.dropAll()

      await models()['WarehouseTest'].insertMany(warehouses)

      centralWarehouse = warehouses.find(x => !x.has_customer_pickup && !x.is_hub);

      let res = await lib.dbHelpers.addAndLoginAgent('admin', _const.ACCESS_LEVEL.ShopClerk, centralWarehouse._id);
      ShopClerk.cid = res.cid;
      ShopClerk.jar = res.rpJar;

      await lib.dbHelpers.addAndLoginAgent('sm', _const.ACCESS_LEVEL.SalesManager);

      products = await models()['ProductTest'].insertMany([{
        article_no: 'xy123',
        name: 'sample 1',
        product_type: {
          name: 'sample type',
          product_type_id: mongoose.Types.ObjectId()
        },
        brand: {
          name: 'sample brand',
          brand_id: mongoose.Types.ObjectId()
        },
        base_price: 30000,
        desc: 'some description for this product',
        colors: [
          {
            color_id: colorIds[0],
            name: 'green'
          },
          {
            color_id: colorIds[1],
            name: 'yellow'
          }
        ],
        instances: [{
          product_color_id: colorIds[0],
          size: "11",
          price: 2000,
          barcode: '0394081341',
          inventory: [{
            count: 0,
            reserved: 0,
            warehouse_id: warehouses[1]._id
          }, {
            count: 6,
            reserved: 0,
            warehouse_id: warehouses[2]._id
          }, {
            count: 2,
            reserved: 0,
            warehouse_id: warehouses[3]._id
          }, {
            count: 2,
            reserved: 1,
            warehouse_id: warehouses[4]._id
          }]
        },
        {
          product_color_id: colorIds[1],
          size: "10",
          price: 4000,
          barcode: '19231213123',
          inventory: [{
            count: 2,
            reserved: 0,
            warehouse_id: warehouses[1]._id
          }, {
            count: 1,
            reserved: 0,
            warehouse_id: warehouses[2]._id
          }, {
            count: 4,
            reserved: 0,
            warehouse_id: warehouses[3]._id
          }, {
            count: 5,
            reserved: 0,
            warehouse_id: warehouses[4]._id
          }]
        }
        ]
      }]);

      products = JSON.parse(JSON.stringify(products));

      done();
    } catch (err) {
      console.log(err);
    };
  }, 15000);

  it('mismatch trigger should assign 9 order lines to other inventories and set not exists ticket for 1 remaining (not c&c)', async function (done) {
    try {
      this.done = done;

      let order_lines = [];
      for (let i = 0; i < 10; i++) {
        order_lines.push({
          product_id: products[0]._id,
          product_instance_id: products[0].instances[0]._id,
          tickets: [
            {
              receiver_id: mongoose.Types.ObjectId(centralWarehouse._id),
              status: _const.ORDER_LINE_STATUS.default
            }
          ]
        })
      }

      orders = await models()['OrderTest'].insertMany([
        { // order 1 => a normal order which central warehosue has inventory for
          order_time: new Date(),
          is_cart: false,
          transaction_id: 'xy123',
          order_lines,
          tickets: [
            {staus: _const.WaitForAggregation},
            {staus: _const.ORDER_STATUS.WaitForInvoice}
          ]
        }
      ]);

      orders = JSON.parse(JSON.stringify(orders));

      let res = await rp({
        method: 'POST',
        uri: lib.helpers.apiTestURL(`order/mismatch`),
        body: {
          trigger: _const.MISMATCH_TRIGGER.Inbox
        },
        json: true,
        resolveWithFullResponse: true,
        jar: ShopClerk.jar
      });
      expect(res.statusCode).toBe(200);

      let foundOrder = await models()['OrderTest'].findOne();
      expect(foundOrder.tickets.length).toBe(3);
      expect(foundOrder.tickets[2].status).toBe(_const.ORDER_STATUS.WaitForAggregation);

      let foundProduct = await models()['ProductTest'].findOne();

      foundProduct.instances[0].inventory.forEach(x => {
        expect(x.reserved).toBe(x.count);
      });

      let renewOrderLines = foundOrder.order_lines.filter(x => x.tickets.length === 3 && x.tickets[2].status === _const.ORDER_LINE_STATUS.Renew);
      expect(renewOrderLines.length).toBe(9);

      let notExistsOrderLines = foundOrder.order_lines.filter(x => x.tickets.length === 3 && x.tickets[2].status === _const.ORDER_LINE_STATUS.NotExists);
      expect(notExistsOrderLines.length).toBe(1);


      let salesManager = await models()['AgentTest'].findOne({
        'access_level': _const.ACCESS_LEVEL.SalesManager
      });

      expect(notExistsOrderLines[0].tickets[2].receiver_id.toString()).toBe(salesManager._id.toString());


      let paladiumTickets = renewOrderLines.filter(x => x.tickets[2].receiver_id.toString() === warehouses[2]._id.toString());
      let sanaTickets = renewOrderLines.filter(x => x.tickets[2].receiver_id.toString() === warehouses[3]._id.toString());
      let iranMallTickets = renewOrderLines.filter(x => x.tickets[2].receiver_id.toString() === warehouses[4]._id.toString());

      expect(paladiumTickets.length).toBe(6);
      expect(sanaTickets.length).toBe(2);
      expect(iranMallTickets.length).toBe(1);

      done();
    } catch (err) {
      lib.helpers.errorHandler.bind(this)(err)
    };
  });


});