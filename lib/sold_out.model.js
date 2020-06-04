const Base = require('./base.model');
const mongoose = require('mongoose');
const error = require('./errors.list');

class SoldOut extends Base {

  constructor(test = SoldOut.test) {
    super('SoldOut', test);
    this.SoldOutModel = this.model;
  }

  getSoldOuts() {
    return this.SoldOutModel.find().lean();
  }

  async insertProductInstance(productId, productInstanceId) {
    const soldOutExist = await this.SoldOutModel.findOne({
      product_id: mongoose.Types.ObjectId(productId),
      product_instance_id: mongoose.Types.ObjectId(productInstanceId)
   });
   if (!soldOutExist) {
     await this.SoldOutModel.create({
        product_id: mongoose.Types.ObjectId(productId),
        product_instance_id: mongoose.Types.ObjectId(productInstanceId)
     });
   }
    return Promise.resolve();
  }

  async removeProductInstance(productId, productInstanceId) {
    return this.SoldOutModel.remove({
      product_id: mongoose.Types.ObjectId(productId),
      product_instance_id: mongoose.Types.ObjectId(productInstanceId)
    })
  }

  setSoldOutFlagOnPI(body) {
    if (!body.productId || !mongoose.Types.ObjectId.isValid(body.productId) ||
      !body.productInstanceId || !mongoose.Types.ObjectId.isValid(body.productInstanceId))
      return Promise.reject(error.invalidId);

    if (!body.hasOwnProperty('soldOutStatus'))
      return Promise.reject(error.soldOutStatusIsRequired);

    const ProductModel = require('./product.model');
    return new ProductModel(SoldOut.test).setSoldOutFlag(body.productId, body.productInstanceId, body.soldOutStatus)
  }

  search(options, offset, limit) {
    let result;
    return this.SoldOutModel.aggregate(
      [
        {
          $match: {
            'expiration_date': {$lte: new Date()}
          }
        },
        {
          $lookup: {
            from: 'product',
            localField: 'product_id',
            foreignField: '_id',
            as: 'product'
          },
        },
        {
          $unwind: {
            path: '$product',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $unwind: {
            path: '$product.instances',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            _id: '$id',
            product: '$product',
            sold_out_date: '$sold_out_date',
            expiration_date: '$expiration_date',
            cmp_value: {$cmp: ['$product_instance_id', '$product.instances._id']}
          }
        },
        {
          $match: {
            cmp_value: {$eq: 0}
          }
        },
        {
          $match: {
            $or: [
              {'product.name': {$regex: options.phrase, $options: 'i'}},
              {'product.instances.barcode': {$regex: options.phrase, $options: 'i'}},
              {'product.article_no': {$regex: options.phrase, $options: 'i'}},
            ]
          }
        },
        {
          $sort: {
            'sold_out_date': 1,
          }
        },
        {
          $skip: Number.parseInt(offset)
        },
        {
          $limit: Number.parseInt(limit)
        }
      ]
    ).then(res => {
      result = res;
      return this.SoldOutModel.aggregate(
        [
          {
            $match: {
              'expiration_date': {$lte: new Date()}
            }
          },
          {
            $lookup: {
              from: 'product',
              localField: 'product_id',
              foreignField: '_id',
              as: 'product'
            },
          },
          {
            $match: {'product.name': {$regex: options.phrase, $options: 'i'}}
          },
          {
            $count: 'count'
          },
        ]
      ).then(res => {
        let totalCount = res[0] ? res[0].count : 0;
        return Promise.resolve({
          data: result,
          total: totalCount,
        });
      });
    });
  }
}

SoldOut.test = false;

module.exports = SoldOut;