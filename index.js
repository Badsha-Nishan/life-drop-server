const express = require("express");
const cors = require("cors");
const app = express();
const port = 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const donationRequestCollection = database.collection("donation-request");

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

    // Create Donation-Request Data
    app.post("/api/donation-request", async (req, res) => {
      try {
        const requestData = req.body;

        console.log("Received:", requestData);

        const result = await donationRequestCollection.insertOne(requestData);

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // ALL Donation Request
    app.get("/api/donation-request", async (req, res) => {
      try {
        const request = await donationRequestCollection.find().toArray();
        res.send(request);
      } catch (err) {
        res.status(500).send({ message: "Error fetching Donation Request" });
      }
    });

    // Get Donation-request Data by email
    app.get("/api/donation-request/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // ডাটাবেজের 'requesterEmail' ফিল্ডের সাথে ম্যাচ করানো হলো
        const requests = await donationRequestCollection
          .find({ requesterEmail: email })
          .toArray();

        res.send(requests);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error fetching requests" });
      }
    });

    // Donation Request Update
    app.patch("/api/donation-request/id/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        // অত্যন্ত গুরুত্বপূর্ণ: বডি থেকে _id বাদ দিতে হবে যেন মঙ্গোডিবি এরর না দেয়
        delete updatedData._id;

        const filter = {
          _id: new ObjectId(id),
        };

        const updateDoc = {
          $set: updatedData,
        };

        const result = await donationRequestCollection.updateOne(
          filter,
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Donation request not found.",
          });
        }

        res.send({
          success: true,
          message: "Donation request updated successfully.",
          result,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get Single Donation Request by ID
    app.get("/api/donation-request/id/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await donationRequestCollection.findOne(query);
        console.log("this result:", result);

        if (!result) {
          return res.status(404).send({
            success: false,
            message: "Donation request not found.",
          });
        }
        res.send(result);
      } catch (error) {
        console.error("Error fetching single request:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error: " + error.message,
        });
      }
    });

    // ─── ADMIN STATS API ───
    app.get("/api/admin/stats", async (req, res) => {
      try {
        // ১. টোটাল ডোনার সংখ্যা কাউন্ট (যাদের রোল donor অথবা সব ইউজারকে কাউন্ট করতে পারেন)
        const totalDonors = await usersCollection.countDocuments({
          role: "donor",
        });
        // যদি রোল না থাকে, সব ইউজার গুনতে চাইলে: await usersCollection.countDocuments({});

        // ২. টোটাল ব্লাড রিকোয়েস্ট সংখ্যা কাউন্ট
        const bloodRequests = await donationRequestCollection.countDocuments(
          {}
        );

        // ৩. টোটাল ফান্ডিং (আপাতত হার্ডকোডেড রাখতে পারেন যদি ফান্ডিং কালেকশন না থাকে)
        // যদি কালেকশন থাকে: const fundingData = await fundingCollection.aggregate([...])
        const totalFunding = 12886;

        res.send({
          totalDonors,
          totalFunding,
          bloodRequests,
        });
      } catch (err) {
        console.error("Error fetching admin stats:", err);
        res.status(500).send({ message: "Server error fetching stats" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
