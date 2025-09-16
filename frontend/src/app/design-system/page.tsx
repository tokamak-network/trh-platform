"use client";

import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";

function DesignSystemContent() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">
            TRH Platform Design System
          </h1>
          <p className="text-xl text-neutral-600">
            Built with shadcn/ui components and custom brand colors
          </p>
        </div>

        {/* Color Palette Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Brand Colors</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Primary Colors</h3>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(
                  (shade) => (
                    <div key={shade} className="text-center">
                      <div
                        className={`w-12 h-12 mx-auto rounded-lg mb-1 bg-primary-${shade} border border-neutral-200`}
                      />
                      <span className="text-xs text-neutral-600">{shade}</span>
                      {shade === 500 && (
                        <div className="text-xs font-medium text-primary-600">
                          #0070ED
                        </div>
                      )}
                      {shade === 600 && (
                        <div className="text-xs font-medium text-primary-600">
                          #0057E6
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Secondary Colors</h3>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(
                  (shade) => (
                    <div key={shade} className="text-center">
                      <div
                        className={`w-12 h-12 mx-auto rounded-lg mb-1 bg-secondary-${shade} border border-neutral-200`}
                      />
                      <span className="text-xs text-neutral-600">{shade}</span>
                      {shade === 50 && (
                        <div className="text-xs font-medium text-primary-600">
                          #F8FAFF
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Disabled State</h3>
              <div className="flex gap-4 items-center">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto rounded-lg mb-1 bg-disabled border border-neutral-200" />
                  <span className="text-xs text-neutral-600">Disabled</span>
                  <div className="text-xs font-medium text-primary-600">
                    #E9EDF1
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Buttons</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Variants</h3>
              <div className="flex flex-wrap gap-4">
                <Button variant="default">Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="outline">Outline Button</Button>
                <Button variant="ghost">Ghost Button</Button>
                <Button variant="link">Link Button</Button>
                <Button variant="destructive">Destructive Button</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Sizes</h3>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">🔍</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">States</h3>
              <div className="flex flex-wrap gap-4">
                <Button>Normal</Button>
                <Button disabled>Disabled</Button>
                <Button className="opacity-75">Loading...</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Inputs Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Inputs</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Input
                </label>
                <Input placeholder="Enter your text..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Disabled Input
                </label>
                <Input placeholder="Disabled input" disabled />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Input
                </label>
                <Input type="email" placeholder="Enter your email..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Password Input
                </label>
                <Input type="password" placeholder="Enter your password..." />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Input with Error
                </label>
                <Input
                  placeholder="Enter your email..."
                  className="border-destructive"
                />
                <p className="text-sm text-destructive mt-1">
                  Please enter a valid email address
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Input with Error (Focused)
                </label>
                <Input
                  placeholder="Enter your name..."
                  className="border-destructive"
                  autoFocus
                />
                <p className="text-sm text-destructive mt-1">
                  Name is required
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Primary Card</CardTitle>
                <CardDescription>Card with primary action</CardDescription>
              </CardHeader>
              <CardContent>
                <p>
                  This card demonstrates the primary color scheme with your
                  custom brand colors.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="default">Primary Action</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Secondary Card</CardTitle>
                <CardDescription>Card with secondary styling</CardDescription>
              </CardHeader>
              <CardContent>
                <p>
                  This card uses the secondary color palette for a softer
                  appearance.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary">Secondary Action</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p>Simple card with just content and no header or footer.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Badges Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Badges</h2>
          <div className="flex flex-wrap gap-4">
            <Badge variant="default">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </section>

        {/* Avatars Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Avatars</h2>
          <div className="flex flex-wrap gap-4">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarImage src="https://github.com/vercel.png" alt="@vercel" />
              <AvatarFallback>VR</AvatarFallback>
            </Avatar>
          </div>
        </section>

        {/* Checkboxes Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Checkboxes</h2>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox id="terms" />
              <label
                htmlFor="terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Accept terms and conditions
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="marketing" defaultChecked />
              <label
                htmlFor="marketing"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Send me marketing emails
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="disabled" disabled />
              <label
                htmlFor="disabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Disabled checkbox
              </label>
            </div>
          </div>
        </section>

        {/* Usage Examples */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Usage Examples</h2>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Form Example</CardTitle>
                <CardDescription>
                  How to use inputs and buttons together
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <Input type="email" placeholder="Enter your email" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <Input type="password" placeholder="Enter your password" />
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="default">Sign In</Button>
                <Button variant="outline">Cancel</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Profile</CardTitle>
                <CardDescription>Combining multiple components</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-medium">John Doe</h4>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="default">Admin</Badge>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DesignSystemContent />
    </Suspense>
  );
}
