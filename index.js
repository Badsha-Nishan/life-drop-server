const express = require("express");
const cors = require("cors");
const app = express();
const port = 5000;
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    // await client.connect();

    const database = client.db("lifedrop");
    const usersCollection = database.collection("users");
    const donationRequestCollection = database.collection("donation-request");
    const fundingCollection = database.collection("funding");

    // 💳 CREATE STRIPE CHECKOUT SESSION (UPDATED)
    app.post("/api/create-checkout-session", async (req, res) => {
      try {
        const { amount, userEmail, userName } = req.body;

        if (!amount || amount <= 0) {
          return res.status(400).send({ message: "Invalid donation amount" });
        }

        // স্ট্রাইপ সেশন তৈরি
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "LifeDrop Foundation - Blood Donation Funding",
                  description: `Thank you, ${userName} for supporting our community.`,
                },
                unit_amount: amount * 100, // সেন্টস
              },
              quantity: 1,
            },
          ],
          mode: "payment",

          // ✨ ফিক্স: এখানে session_id={CHECKOUT_SESSION_ID} যুক্ত করা হয়েছে যেন ফ্রন্টএন্ড সেশন আইডি পায়
          success_url: `${process.env.CLIENT_URL}/funding?success=true&amount=${amount}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/funding?canceled=true`,
          metadata: {
            userEmail,
            userName,
          },
        });

        res.send({ id: session.id, url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ message: error.message });
      }
    });

    // 📊 FUNDING HISTORY API (সব ফান্ডিংয়ের লিস্ট দেখতে)
    app.get("/api/funding-history", async (req, res) => {
      try {
        const history = await fundingCollection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.send(history);
      } catch (err) {
        res.status(500).send({ message: "Error fetching funding history" });
      }
    });

    // 🔍 SEARCH/FILTER BLOOD DONORS
    app.get("/api/search-donors", async (req, res) => {
      try {
        const { bloodGroup, district, upazila } = req.query;

        // মেইন কোয়েরি অবজেক্ট (শুধুমাত্র যাদের রোল 'donor' বা 'volunteer' তাদের খোঁজা হবে)
        let query = {
          role: { $in: ["donor", "volunteer"] },
          status: "active", // ব্লকড ইউজারদের বাদ দেওয়া হলো
        };

        // ইউজার ফিল্টার সিলেক্ট করলে কোয়েরিতে যোগ হবে
        if (bloodGroup && bloodGroup !== "Select Group") {
          query.bloodGroup = bloodGroup;
        }
        if (district && district !== "Select District") {
          query.district = district;
        }
        if (upazila && upazila !== "Select Upazila") {
          query.upazila = upazila;
        }

        const donors = await usersCollection.find(query).toArray();
        res.send(donors);
      } catch (error) {
        console.error("Error searching donors:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // 💾 ২. সফল পেমেন্টের ডাটা ডাটাবেজে সেভ করার এপিআই (FIXED)
    app.post("/api/save-funding", async (req, res) => {
      try {
        const { userName, userEmail, amount, sessionId } = req.body;

        if (!sessionId) {
          return res.status(400).send({ message: "Session ID is required" });
        }

        // স্ট্রাইপ থেকে পেমেন্ট কনফার্মেশন ও আসল Payment Intent ID তুলে আনা
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res
            .status(400)
            .send({ message: "Payment was not verified by Stripe." });
        }

        // ✨ ফিক্স: আসল payment_intent আইডি দিয়ে ডুপ্লিকেট এন্ট্রি চেক করা হচ্ছে
        const existingPayment = await fundingCollection.findOne({
          paymentIntentId: session.payment_intent,
        });

        if (existingPayment) {
          return res
            .status(400)
            .send({ message: "This transaction has already been recorded." });
        }

        // ডাটাবেজের জন্য অবজেক্ট রেডি করা
        const newFunding = {
          userName,
          userEmail,
          amount: Number(amount),
          paymentIntentId: session.payment_intent, // স্ট্রাইপের অরিজিনাল পেমেন্ট ইনটেন্ট আইডি (pi_...)
          fundingDate: new Date(),
        };

        const result = await fundingCollection.insertOne(newFunding);

        res.status(201).send({
          success: true,
          insertedId: result.insertedId,
          data: newFunding,
        });
      } catch (error) {
        console.error("Save Funding Error:", error);
        res.status(500).send({ message: error.message });
      }
    });

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

    // ─── ADMIN STATS API (DYNAMIC UPDATED)
    app.get("/api/admin/stats", async (req, res) => {
      try {
        const totalDonors = await usersCollection.countDocuments({
          role: "donor",
        });
        const bloodRequests = await donationRequestCollection.countDocuments(
          {}
        );

        // 📊 ডাটাবেজের কালেকশন থেকে রিয়েল-টাইম টোটাল ফান্ডিং হিসাব করা
        const fundingStats = await fundingCollection
          .aggregate([
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
              },
            },
          ])
          .toArray();

        const totalFunding =
          fundingStats.length > 0 ? fundingStats[0].total : 0;

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
