const express = require("express");
const router = express.Router();
const path = require("path");
const mongoose = require("mongoose");
// Models
// https://chatgpt.com/c/67c7fff1-a5a4-8000-a37d-5619da480851
const Project = require("../models/Project");
const Supplier = require("../models/Supplier");
const multer = require("multer"); // Import multer

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Ensure 'uploads' directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

function isAllowedImageFile(file) {
  if (!file) return false;

  const mime = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(String(file.originalname || "")).toLowerCase();

  return ALLOWED_IMAGE_MIME_TYPES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function imageOnlyFileFilter(req, file, cb) {
  if (isAllowedImageFile(file)) {
    cb(null, true);
    return;
  }

  req.fileValidationError = "Only JPG, JPEG, and PNG files are allowed.";
  cb(null, false);
}

const upload = multer({ storage: storage, fileFilter: imageOnlyFileFilter });

// Create Project
router.post("/emp/projects", upload.single("image"), async (req, res) => {
  try {
    console.log("Received Data:", req.body); // Check text data
    console.log("Received File:", req.file); // Check file data

    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }

    if (req.file && !isAllowedImageFile(req.file)) {
      return res.status(400).json({
        message: "Only JPG, JPEG, and PNG files are allowed.",
      });
    }

    const { heading, date, description, totalAmount, remainingAmount } = req.body;

    const newProject = new Project({
      heading,
      date,
      description,
      totalAmount: totalAmount || null,
      remainingAmount: remainingAmount || null,
      image: req.file ? req.file.filename : "", // Store filename
    });

    await newProject.save();
    res.json(newProject);
  } catch (err) {
    console.error("Error saving project:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all projects
router.get("/projects", async (req, res) => {
    try {
        const projects = await Project.find();
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// update project data
router.put("/projects/:id", upload.single("image"), async (req, res) => {
  try {
    const { heading, date, description, totalAmount, remainingAmount } = req.body;
    const updateData = { heading, date, description, totalAmount, remainingAmount };

    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }

    if (req.file && !isAllowedImageFile(req.file)) {
      return res.status(400).json({
        message: "Only JPG, JPEG, and PNG files are allowed.",
      });
    }

    if (req.file) updateData.image = req.file.filename; // Update image if a new one is uploaded

    const updatedProject = await Project.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!updatedProject) return res.status(404).json({ message: "Project not found" });

    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ message: "Error updating project", error });
  }
});

///////////////////// to add material , amount, project, ///////////////////////////////////////////
router.post('/projects/add-material/:projectId/:supplierId', async (req, res)=>{
  try{
    const {projectId , supplierId} =  req.params;
    const { name , amount , description , date} = req.body

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const supplier = project.suppliers.find(sup => sup.supplierId.toString() === supplierId);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found in this project" });
    }
        // Create a new material object
        const newMaterial = {
          name: name,
          payments: [{ amount, description, date: date || new Date() }]
        };
    
        // Add material under the supplier
        supplier.materials.push(newMaterial);
    
        // Save updated project
        await project.save();
    
        res.status(201).json({ message: "Material & Payment added successfully", project });

  }catch(error){
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
} )
///////////////////// to add New Supplier to the project ///////////////////////////////////////////
router.post('/projects/add-supplier/:projectId', async(req, res)=>{
  try{
    const { projectId } = req.params;
    const { supplierId, name, phoneNo, materials } = req.body;

    if (!supplierId || !name || !phoneNo) {
      return res.status(400).json({ message: "Supplier details are required" });
    }
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const newSupplier = {
      supplierId,
      name,
      phoneNo,
      materials: materials || [], // Default to empty if not provided
    };
    project.suppliers.push(newSupplier);
    await project.save();

    res.status(200).json({ message: "Supplier added successfully", project });

  }catch(error){
    console.error("Error adding supplier:", error);
    res.status(500).json({message: "insternal server errror"})
  }
})

//////////////////////////////////////////////////////////////////////////////
//to fexth Projects
router.get("/projects/:projectId", async (req, res) => {
    try {
      const project = await Project.findById(req.params.projectId).populate("suppliers");
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  });

  //adding Employee to the project.
router.post("/projects/:id/employees", async (req, res) => {
    try {
        const { name, phoneNo, roleOrMaterial, salaryOrTotalPayment} = req.body;
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const newEmployee = { name, phoneNo, roleOrMaterial, salaryOrTotalPayment, payments: [] };
        project.employees.push(newEmployee);
        await project.save();

        res.status(201).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Used for adding Payemnts
router.post("/projects/:projectId/employees/:employeeId/payments", async (req, res) => {
    try {
        const { amount, date,  description } = req.body;
        const project = await Project.findById(req.params.projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const employee = project.employees.id(req.params.employeeId);
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        employee.payments.push({ amount, date,  description });
        await project.save();

        res.status(201).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//to add supplier to the project 
router.post("/projects/:projectId/suppliers", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { supplierId, materials, payment } = req.body;

    console.log("Supplier ID received:", supplierId);

    // Validate projectId and supplierId
    if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ message: "Invalid Project ID or Supplier ID format" });
    }

    // Fetch supplier
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      console.log("Supplier not found in DB:", supplierId);
      return res.status(404).json({ message: "Supplier not found in database" });
    }

    // Fetch project
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if supplier already exists in the project
    let existingSupplier = project.suppliers.find(s => s.supplierId.toString() === supplierId);

    if (existingSupplier) {
      // Update existing supplier's materials and payments in project
      existingSupplier.materials = [...existingSupplier.materials, ...(materials || [])];
      existingSupplier.payment = (existingSupplier.payment || 0) + (payment || 0);
    } else {
      // Add supplier to project
      project.suppliers.push({
        supplierId: supplier._id,
        name: supplier.name,
        phoneNo: supplier.phoneNo,
        materials: materials || [],
        payment: payment || 0,
      });
    }

    // Add project reference to supplier
    let existingProject = supplier.projects.find(p => p.projectId.toString() === projectId);
    if (existingProject) {
      existingProject.materials = [...existingProject.materials, ...(materials || [])];
      existingProject.payment = (existingProject.payment || 0) + (payment || 0);
    } else {
      supplier.projects.push({
        projectId: project._id,
        projectName: project.name,
        materials: materials || [],
        payment: payment || 0,
      });
    }

    // Save changes
    await project.save();
    await supplier.save();

    res.status(201).json({ message: "Supplier updated in project and supplier record", project, supplier });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error adding supplier", error });
  }
});


//fetch all the supplier which are added into the project.
router.get("/projects/:projectId/suppliers", async (req, res) => {
  try {
    const suppliers = await Supplier.find().select("name phoneNo _id");
    res.status(200).json(suppliers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching suppliers", error });
  }
});


// add payemnts for employee
router.post("/projectEmpayment/:projectId/employees/:employeeId/payments",async(req, res)=>{
  try{
    const {projectId, employeeId} = req.params;
    const {amount , description} = req.body;

    const project= await Project.findById(projectId);
    if(!project) return res.status(404).json({message : "Project not found"})

      const employee = project.employees.find(emp => emp._id.toString() === employeeId);
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      const payment = { amount, description, date: new Date() };
      employee.payments.push(payment);
        
      await project.save();
    res.status(200).json({ message: "Payment added successfully", payment });

  }catch  (error){
    res.status(500).json({ error: error.message });
  }
})

//add supplier payment 
router.post("/projectSpayment/:projectId/suppliers/:supplierId/materials/:materialId/payments", async(req, res)=>{
  try{ 

    const {projectId , supplierId, materialId} = req.params;
    const {amount , description} = req.body;

     const project = await Project.findById(projectId);
     if(!project) return res.status(404).json({message : "Project not found" });

     const supplier = project.suppliers.find( supp => supp.supplierId.toString() === supplierId);
     if(!supplier) return res.status(404).json({message: "Supplier not found"})

      const material = supplier.materials.find(mat => mat._id.toString() === materialId);
      if(!material) return res.status(404).json({message: "material not found"});
      
      const payment = {amount , description , date: new Date()};
      material.payments.push(payment);

      await project.save()
      res.status(200).json({message: "Payement added successfully", payment });

  }catch(error){
    res.status(500).json({message: "Error fetching suppliers", error})
  }
})
 
// update payment details for supplier. 
router.put("/project/:projectId/supplier/:supplierId/material/:materialId/payment/:paymentId", async(req, res)=>{
  try{
    const { projectId, supplierId, materialId, paymentId } = req.params;
    const { amount, description, date } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const supplier = project.suppliers.find((s) => s.supplierId.toString() === supplierId);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const material = supplier.materials.find((m) => m._id.toString() === materialId);
    if (!material) return res.status(404).json({ message: "Material not found" });

    const payment = material.payments.find((p) => p._id.toString() === paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Update fields
    if (amount) payment.amount = amount;
    if (description) payment.description = description;
    if (date) payment.date = date;

    await project.save();
    res.json({ message: "Supplier payment updated successfully", updatedPayment: payment });
  }catch(error){
    console.error("Error updating supplier payment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

//update payment for employee
router.put("/project/:projectId/employee/:employeeId/payment/:paymentId", async(req , res)=>{
  try{
    const { projectId, employeeId, paymentId } = req.params;
    const { amount, description, date } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const employee = project.employees.find((e) => e._id.toString() === employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const payment = employee.payments.find((p) => p._id.toString() === paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Update fields
    if (amount) payment.amount = amount;
    if (description) payment.description = description;
    if (date) payment.date = date;

    await project.save();
    res.json({ message: "Employee payment updated successfully", updatedPayment: payment });
    
  }catch(error){
    console.error("Error updating employee payment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

router.delete("/projects/:projectId/suppliers/:supplierId/materials/:materialId", async (req, res) => {
  try {
    const { projectId, supplierId, materialId } = req.params;

    // Find project by ID
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Find the supplier in the project
    const supplier = project.suppliers.find(
      (sup) => sup.supplierId.toString() === supplierId
    );

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Filter out the material to be deleted
    supplier.materials = supplier.materials.filter(
      (mat) => mat._id.toString() !== materialId
    );

    // Save the updated project
    await project.save();

    res.status(200).json({ message: "Material deleted successfully", project });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;


//router.post("/", async (req, res) => {
//     try {
//       const { supplierId, supplierName, material, paymentAmount } = req.body;
  
//       const newProject = new Project({
//         supplierId,
//         supplierName,
//         material,
//         paymentAmount
//       });
  
//       await newProject.save();
//       res.status(201).json(newProject);
//     } catch (err) {
//       res.status(500).json({ message: err.message });
//     }
//   });


// Add a payment to a material in a supplier inside a project
// router.post("/projects/:projectId/suppliers/:supplierId/materials/:materialId/payments", async (req, res) => {
//   try {
//     const { projectId, supplierId, materialId } = req.params;
//     const { amount, description } = req.body;

//     if (!amount || !description) {
//       return res.status(400).json({ message: "Amount and description are required" });
//     }

//     // Find the project
//     const project = await Project.findById(projectId);
//     if (!project) {
//       return res.status(404).json({ message: "Project not found" });
//     }

//     // Find the supplier inside the project
//     const supplier = project.suppliers.find(s => s.supplierId.toString() === supplierId);
//     if (!supplier) {
//       return res.status(404).json({ message: "Supplier not found in project" });
//     }

//     // Find the material inside the supplier
//     const material = supplier.materials.find(m => m._id.toString() === materialId);
//     if (!material) {
//       return res.status(404).json({ message: "Material not found in supplier" });
//     }

//     // Add the payment to the material's payments array
//     const newPayment = {
//       amount: parseFloat(amount),
//       description,
//       date: new Date(),
//     };
//     material.payments.push(newPayment);

//     // Save the updated project
//     await project.save();

//     res.status(200).json({ message: "Payment added successfully", project });
//   } catch (error) {
//     console.error("Error adding payment:", error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// });



//for putting the supplier into project.
// router.post("/projects/:projectId/suppliers/:supplierId", async (req, res) => {
//   try {
//       const projectId = req.params.projectId;
//       if (!mongoose.Types.ObjectId.isValid(projectId)) {
//           return res.status(400).json({ error: "Invalid project ID" });
//       }
//       // Proceed with the database operation
//   } catch (error) {
//       res.status(500).json({ error: error.message });
//   }
// });
