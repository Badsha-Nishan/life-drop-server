const express = require("express");
const cors = require("cors");
const app = express();
const port = 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("lifedrop");
    const usersCollection = database.collection("users");

    // Create Users Data
    app.post("/api/users", async (req, res) => {
      try {
        const usersData = req.body;

        console.log("Received:", usersData);

        const result = await usersCollection.insertOne(usersData);

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // SINGLE USER BY EMAIL
    app.get("/api/users/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (err) {
        res.status(500).send({ message: "Error fetching user" });
      }
    });

    // Profile Update
    app.patch("/api/users/:email", async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;

      const filter = { email };

      const updateDoc = {
        $set: {
          name: updatedData.name,
          district: updatedData.district,
          upazila: updatedData.upazila,
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    // ALL USERS
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ message: "Error fetching users" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
