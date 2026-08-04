require("dotenv").config();

const express = require("express");
const cors = require("cors");

const activate = require("./routes/activate");

const app = express();

app.use(cors());

app.use(express.json());

app.get("/", (req,res)=>{

    res.send("License Server Running");

});

app.use("/api/activate", activate);

app.listen(3000, "0.0.0.0", () => {

    console.log("Server running on port 3000");

});