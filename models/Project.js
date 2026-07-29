const mongoose = require('mongoose');
const { suppliersDB } = require("../config/mainte"); 

const PaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  description: { type: String, required: true },
});

const EmployeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phoneNo: { type: String, required: true },
  roleOrMaterial: { type: String, required: true }, // Role for employees, Material for suppliers
  salaryOrTotalPayment: { type: Number }, // Salary for employees, Total payment for suppliers
  payments: { type: [PaymentSchema], default: [] },
});

const MaterialSchema = new mongoose.Schema({
  name: { type: String, required: true },
  payments: { type: [PaymentSchema], default: [] },
});

// const ProjectSupplierSchema = new mongoose.Schema({
//   supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },  
//   name: { type: String, required: true },
//   phoneNo: { type: String, required: true },
//   materials: { type: [MaterialSchema], default: [] }, // Each supplier can have multiple materials inside the project
// });

const ProjectSchema = new mongoose.Schema({
  heading:  { type: String, required: true },
  date: { type: Date, default: Date.now },
  description:  { type: String, required: true },
  totalAmount: { type: Number, default: null },
  remainingAmount: { type: Number, default: null },
  image: { type: String, default: "" },
  employees: [EmployeeSchema],
  suppliers:  [
    {
      supplierId: mongoose.Schema.Types.ObjectId,
      name: String,
      phoneNo: String,
      materials: [MaterialSchema]
    }
  ]
});

const Project = suppliersDB.model("Project", ProjectSchema);
module.exports = Project;



// const PaymentSchema = new mongoose.Schema({
//   amount: Number,
//   date: { type: Date, default: Date.now },
  
// });

// const EmployeeSchema = new mongoose.Schema({
//   name: String,
//   role: String,
//   salary: Number,
//   payments: [PaymentSchema]
// });
