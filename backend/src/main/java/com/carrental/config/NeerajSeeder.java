package com.carrental.config;

import com.carrental.model.Car;
import com.carrental.model.CarMedia;
import com.carrental.model.Document;
import com.carrental.model.Owner;
import com.carrental.repository.CarMediaRepository;
import com.carrental.repository.CarRepository;
import com.carrental.repository.DocumentRepository;
import com.carrental.repository.OwnerRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Seeds the demo owner "Neeraj" with an approved documents trail and a small
 * fleet of verified cars, so the owner dashboard's "My cars" view is populated
 * on first startup. Idempotent: exits early if the account already exists.
 */
@Configuration
public class NeerajSeeder {

    private static final String NEERAJ_EMAIL = "neeraj@carrental.app";

    @Bean
    public CommandLineRunner seedNeeraj(OwnerRepository ownerRepository,
                                        CarRepository carRepository,
                                        CarMediaRepository carMediaRepository,
                                        DocumentRepository documentRepository,
                                        PasswordEncoder passwordEncoder) {
        return args -> {
            if (ownerRepository.existsByEmail(NEERAJ_EMAIL)) {
                return;
            }

            Owner neeraj = new Owner();
            neeraj.setName("Neeraj");
            neeraj.setEmail(NEERAJ_EMAIL);
            neeraj.setPassword(passwordEncoder.encode("neeraj123"));
            neeraj.setPhone("+91 98765 43210");
            neeraj.setCity("Hyderabad");
            neeraj.setVerified(true);
            neeraj.setCreatedAt(LocalDateTime.now());
            neeraj = ownerRepository.save(neeraj);

            // Approved documents trail (matches the agent-approval flow)
            seedDocument(documentRepository, neeraj, "Aadhaar", "/images/owner.png", "approved");
            seedDocument(documentRepository, neeraj, "Driving License", "/images/owner.png", "approved");
            seedDocument(documentRepository, neeraj, "RC / Registration", "/images/owner.png", "approved");

            // Fleet shown under "My cars"
            seedCar(carRepository, carMediaRepository, neeraj,
                    "Maruti Suzuki", "Swift", 2022, "TS 09 AB 1234", "Pearl White",
                    "petrol", "manual", 5, "1900",
                    List.of("/icons/hatchback.svg", "/icons/realistic-flat/hatchback.svg"),
                    "City hatchback that is easy to park and cheap to run. Perfect for daily commutes.",
                    "Hyderabad");
            seedCar(carRepository, carMediaRepository, neeraj,
                    "Hyundai", "Creta", 2023, "TS 10 CD 5678", "Phantom Black",
                    "diesel", "automatic", 5, "3600",
                    List.of("/icons/suv.svg", "/icons/realistic-shaded/suv.svg"),
                    "Popular compact SUV with a smooth automatic gearbox. Great for highway drives.",
                    "Hyderabad");
            seedCar(carRepository, carMediaRepository, neeraj,
                    "Honda", "City", 2022, "TS 09 EF 9012", "Golden Brown",
                    "petrol", "automatic", 5, "2700",
                    List.of("/icons/sedan.svg", "/icons/realistic-flat/sedan.svg"),
                    "Refined sedan with a spacious cabin. Ideal for airport runs and business trips.",
                    "Hyderabad");
            seedCar(carRepository, carMediaRepository, neeraj,
                    "Toyota", "Innova Crysta", 2021, "TS 08 GH 3456", "Silver",
                    "diesel", "manual", 7, "4200",
                    List.of("/icons/tempo-van.svg", "/icons/realistic-shaded/tempo-van.svg"),
                    "Spacious 7-seater MUV for family road trips. Comfortable for the whole crew.",
                    "Hyderabad");
        };
    }

    private void seedCar(CarRepository carRepository,
                         CarMediaRepository carMediaRepository,
                         Owner owner,
                         String make, String model, int year, String registrationNumber, String color,
                         String fuelType, String transmission, int seats, String pricePerDay,
                         List<String> mediaUrls, String description, String city) {
        Car car = new Car();
        car.setOwner(owner);
        car.setMake(make);
        car.setModel(model);
        car.setYear(year);
        car.setRegistrationNumber(registrationNumber);
        car.setColor(color);
        car.setFuelType(fuelType);
        car.setTransmission(transmission);
        car.setSeats(seats);
        car.setPricePerDay(new BigDecimal(pricePerDay));
        car.setPricingMode("DAILY");
        car.setCancelPolicyHours(24);
        car.setCity(city);
        car.setDescription(description);
        car.setAvailable(true);
        car.setVerified(true);
        car.setCreatedAt(LocalDateTime.now());
        car = carRepository.save(car);

        int order = 0;
        for (String url : mediaUrls) {
            CarMedia media = new CarMedia();
            media.setCar(car);
            media.setMediaType("image");
            media.setMediaUrl(url);
            media.setPrimary(order == 0);
            media.setDisplayOrder(order++);
            carMediaRepository.save(media);
        }
    }

    private void seedDocument(DocumentRepository documentRepository, Owner owner,
                              String docType, String docUrl, String status) {
        Document doc = new Document();
        doc.setOwner(owner);
        doc.setDocType(docType);
        doc.setDocUrl(docUrl);
        doc.setVerificationStatus(status);
        doc.setCreatedAt(LocalDateTime.now());
        documentRepository.save(doc);
    }
}
