const mongoose = require('mongoose');
const { suppliersDB } = require("../config/mainte"); 

const PaymentSchema = new mongoose.Schema({
     amount :{ type: Number, required: true},
     description : {type:String, require: true},
     date:{type:Date , default: Date.now},    
  });

  const MaterialSchema = new mongoose.Schema({
    name: { type: String, required: true },
    payments: { type: [PaymentSchema], default: [] }, // Payment history per material
  });

  const SupplierSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phoneNo: { type: String, required: true },
    address: { type: String, required: true },
    materials: { type: [MaterialSchema], default: [] }, // Now stores multiple materials
    projects: [{  projectId: mongoose.Schema.Types.ObjectId,
      projectName: String,
      materials: [MaterialSchema]
    }
    ]
  });

  SupplierSchema.virtual("remainingBalance").get(function () {
    return this.materials.reduce((total, material) => {
      return total + material.payments.reduce((sum, payment) => sum + payment.amount, 0);
    }, 0);
  });

  const Supplier = suppliersDB.model("Supplier", SupplierSchema);
  module.exports = Supplier;