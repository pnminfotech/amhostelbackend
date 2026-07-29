require("dotenv").config();

const { sendAdmissionMessage } = require("../lib/msg91Admission");

async function main() {
  const phone = process.argv[2];

  if (!phone) {
    console.error("Usage: node scripts/testMsg91Admission.js <phone>");
    process.exit(1);
  }

  const result = await sendAdmissionMessage({
    name: "Test Tenant",
    phoneNo: phone,
    joiningDate: new Date(),
    roomNo: "101",
    bedNo: "A",
    category: "Hostel",
    baseRent: 5000,
    depositAmount: 10000,
  });

  console.log("MSG91 test result:", result);
}

main().catch((error) => {
  console.error("MSG91 test failed:", error?.data || error?.message || error);
  process.exit(1);
});
