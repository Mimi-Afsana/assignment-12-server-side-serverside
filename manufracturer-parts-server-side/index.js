const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(`${process.env.STRIPE_SECRET_KEY}`);

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xzkge.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
// console.log(uri);

function verifyJWTToken(req, res, next) {
  const authHeader = req.headers.authorization;
  // console.log(authHeader);
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const toolsCollection = client.db("refrigerator_tools").collection("tools");
    const bookingCollection = client
      .db("refrigerator_tools")
      .collection("bookings");
    const userCollection = client.db("refrigerator_tools").collection("users");
    const userProfileCollection = client
      .db("refrigerator_tools")
      .collection("userProfile");
    const paymentCollection = client
      .db("refrigerator_tools")
      .collection("payments");
    const reviewsCollection = client
      .db("refrigerator_tools")
      .collection("reviews");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    app.get("/tools", async (req, res) => {
      const query = {};
      const cursor = toolsCollection.find(query);
      const tools = await cursor.toArray();
      res.send(tools);
    });

    // update profile information
    app.put("/api/users/profile", verifyJWTToken, async (req, res) => {
      const data = req.body;
      const filter = { email: data.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: data,
      };
      const result = await userProfileCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send({ result });
    });

    // shipment
    app.patch(
      "/api/orders/shipped/:id",
      verifyJWTToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const status = req.body;
        const filter = { _id: ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: status.status,
          },
        };
        const updatedBooking = await bookingCollection.updateOne(
          filter,
          updatedDoc
        );
        res.send(updatedBooking);
      }
    );

    app.get("/tool/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const tool = await toolsCollection.findOne(query);
      res.send(tool);
    });

    // bookingCollection 
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const result = bookingCollection.insertOne(booking);
      res.send(result);
    });

    //pay route booking by particular id
    app.get("/mybooking/:id", async (req, res) => {
      console.log(req.params);
      const id = req.params.id;

      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      console.log(booking);
      res.send(booking);
    });

    // get booking orders
    app.get("/booking", verifyJWTToken, async (req, res) => {
      const email = req.query.email;
      // const authorization = req.headers.authorization;
      // console.log(authorization);
      const query = { email: email };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });

    // delete booking orders
    app.delete("/booking", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const bookings = await bookingCollection.deleteOne(query);
      res.send(bookings);
    });

    //showing my profile information there will be all user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    // admin nh tader access korte dibo nh nh
    app.get("/admins/:email", verifyJWTToken, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // make user admin
    app.put(
      "/user/admin/:email",
      verifyJWTToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );
    // get user data by email
    app.get("/user", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollection.find(query).toArray();
      res.send(user);
    });

    // get all user
    app.get("/allusers", verifyJWTToken, verifyAdmin, async (req, res) => {
      const query = {};
      const user = await userCollection.find(query).toArray();
      res.send(user);
    });

    // delete data from all user
    app.delete("/alluserr/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // user profile
    // app.post("/userProfile", async (req, res) => {
    //   const userProfile = req.body;
    //   const result = await userProfileCollection.insertOne(userProfile);
    //   res.send(result);
    // });

    // manage all orders
    app.get("/bookingOrder", verifyJWTToken, async (req, res) => {
      const query = {};
      const cursor = await bookingCollection.find(query).toArray();
      res.send(cursor);
    });
    // getuser profile information
    app.get("/userProfile", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userProfileCollection.find(query).toArray();
      res.send(user);
    });

    app.delete("/bookingOrder/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    // delete from manageProducts
    app.delete("/manage/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await toolsCollection.deleteOne(query);
      res.send(result);
    });

    // add new product
    app.post("/addItem", verifyJWTToken, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await toolsCollection.insertOne(newItem);
      res.send(result);
    });

    // post reviews data
    app.post("/reviews", verifyJWTToken, async (req, res) => {
      const newItem = req.body;
      const result = await reviewsCollection.insertOne(newItem);
      res.send(result);
    });

    // get reviews data from bakend
    app.get("/reviewsget", async (req, res) => {
      const query = {};
      const cursor = await reviewsCollection.find(query).toArray();
      res.send(cursor);
    });
    // payment post api
    app.post("/create-payment-intent", verifyJWTToken, async (req, res) => {
      const service = req.body;
      // console.log(service);
      const price = service.price;
      // console.log(price);
      const amount = price * 100;
      console.log(amount);
      if (amount) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        return res.send({ clientSecret: paymentIntent.client_secret });
      } else {
        return res.send({ clientSecret: "" });
      }
    });

    // update booking
    app.patch("/cardBooking/:id", verifyJWTToken, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedBooking);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to our menufracturer company!");
});

app.listen(port, () => {
  console.log(`Welcome to our main refrigerator parts menufracturer. ${port}`);
});
